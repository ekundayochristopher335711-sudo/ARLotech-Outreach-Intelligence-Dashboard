import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const allowedCategories = new Set(["Visual hierarchy", "Spacing and alignment", "Typography", "Color and contrast", "Layout and composition", "Navigation and UX", "Calls to action", "Imagery", "Responsive design", "Consistency"]);
const allowedSeverity = new Set(["critical", "high", "medium", "low", "informational"]);
const allowedTypes = new Set(["confirmed_issue", "improvement_opportunity"]);

type StoredScreenshotPage = Record<string, unknown> & { image_path: string };

function parseOutput(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("The vision model returned an invalid response.");
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.findings)) throw new Error("The vision model returned an invalid findings list.");
  const normalized = result.findings.slice(0, 60).map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("A visual finding was malformed.");
    const f = raw as Record<string, unknown>;
    const confidence = Number(f.confidence);
    const severity = String(f.severity || "informational").toLowerCase();
    const findingType = String(f.finding_type || "improvement_opportunity");
    const category = String(f.category || "Layout and composition");
    if (!allowedSeverity.has(severity) || !allowedTypes.has(findingType) || !allowedCategories.has(category) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("A visual finding failed validation.");
    const required = ["title", "observation", "evidence", "user_impact", "recommendation", "page_url", "page_label", "location", "device"];
    for (const key of required) if (typeof f[key] !== "string" || !(f[key] as string).trim()) throw new Error(`A visual finding is missing ${key}.`);
    if (!["desktop", "mobile", "both", "unknown"].includes(String(f.device))) throw new Error("A visual finding has an invalid device.");
    return {
      id: crypto.randomUUID(), title: String(f.title).slice(0, 180), category, severity,
      device: String(f.device), page_url: String(f.page_url), page_label: String(f.page_label),
      location: String(f.location), observation: String(f.observation), evidence: String(f.evidence),
      user_impact: String(f.user_impact), recommendation: String(f.recommendation),
      confidence, finding_type: findingType,
    };
  });
  const score = Number(result.visual_score);
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("The visual score was invalid.");
  const assessment = result.assessment as Record<string, unknown>;
  if (!assessment || typeof assessment !== "object" || typeof assessment.summary !== "string" || typeof assessment.score_explanation !== "string") throw new Error("The visual assessment was incomplete.");
  return {
    visual_score: score,
    score_explanation: String(assessment.score_explanation),
    assessment: {
      summary: String(assessment.summary),
      visual_hierarchy: String(assessment.visual_hierarchy || "Not assessed"),
      typography: String(assessment.typography || "Not assessed"),
      layout_consistency: String(assessment.layout_consistency || "Not assessed"),
      color_consistency: String(assessment.color_consistency || "Not assessed"),
      desktop_presentation: String(assessment.desktop_presentation || "Not assessed"),
      mobile_presentation: String(assessment.mobile_presentation || "Not assessed"),
      professional_appearance: String(assessment.professional_appearance || "Not assessed"),
      user_experience: String(assessment.user_experience || "Not assessed"),
      most_important_improvements: Array.isArray(assessment.most_important_improvements) ? assessment.most_important_improvements.slice(0, 8).map(String) : [],
    },
    findings: normalized,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Authentication required." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session." }, 401);
    const { audit_id } = await req.json();
    if (typeof audit_id !== "string" || !/^[0-9a-f-]{20,}$/i.test(audit_id)) return json({ error: "A valid audit ID is required." }, 400);
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: audit, error: auditError } = await admin.from("website_analyses").select("id,user_id,website_url,analysis_details").eq("id", audit_id).eq("user_id", userData.user.id).maybeSingle();
    if (auditError || !audit) return json({ error: "Audit not found or access denied." }, 404);
    const review = audit.analysis_details?.screenshot_review;
    const screenshotPages = Array.isArray(review?.pages)
      ? review.pages.filter((page: unknown): page is StoredScreenshotPage =>
          !!page && typeof page === "object" && typeof page.image_path === "string")
      : [];
    const ownedScreenshotPath = new RegExp(
      `^${userData.user.id}/${audit_id}/[^/]+\\.(?:jpe?g|png|webp)$`,
      "i",
    );
    if (screenshotPages.some((page) => !ownedScreenshotPath.test(page.image_path))) {
      return json({ error: "A screenshot path does not belong to this audit." }, 403);
    }
    const pages = screenshotPages;
    if (!pages.length) return json({ error: "No successfully stored screenshots are available for visual analysis." }, 422);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY is not configured for this Supabase project." }, 503);
    const model = Deno.env.get("OPENAI_VISION_MODEL") || "gpt-4.1-mini";
    const imageParts: any[] = [];
    const inspected: any[] = [];
    for (const page of pages.slice(0, 10)) {
      const { data: file, error } = await admin.storage
        .from("website-audit-screenshots")
        .download(page.image_path);
      if (error || !file) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length || bytes.length > 8_000_000) continue;
      const mime = file.type || "image/jpeg";
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) continue;
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const dataUrl = `data:${mime};base64,${btoa(binary)}`;
      inspected.push({ page_url: page.page_url, page_label: page.page_label, device: page.viewport });
      imageParts.push({ type: "input_text", text: `Screenshot ${inspected.length}: page=${page.page_label}; URL=${page.page_url}; device=${page.viewport}. Inspect the actual image.` });
      imageParts.push({ type: "input_image", image_url: dataUrl, detail: "high" });
    }
    if (!imageParts.length) return json({ error: "Stored screenshots could not be downloaded or decoded." }, 422);
    const prompt = `Act as a senior commercial UI/UX auditor. Inspect ONLY the supplied screenshot images. Return strict JSON with keys visual_score (integer 0-100), assessment, findings. assessment must include summary, score_explanation, visual_hierarchy, typography, layout_consistency, color_consistency, desktop_presentation, mobile_presentation, professional_appearance, user_experience, most_important_improvements (array). Each finding: title, category (one of Visual hierarchy, Spacing and alignment, Typography, Color and contrast, Layout and composition, Navigation and UX, Calls to action, Imagery, Responsive design, Consistency), severity (critical/high/medium/low/informational), device (desktop/mobile/both/unknown), page_url, page_label, location, observation, evidence, user_impact, recommendation, confidence (0-1), finding_type (confirmed_issue/improvement_opportunity). Evidence must cite visible details. Only report evidenced issues; do not infer functionality from screenshots. Distinguish confirmed defects from optional improvements. Do not penalize minimalist choices. Be willing to report zero findings. Do not duplicate one issue across pages unless independently visible. Score rubric: 90-100 excellent, only minor polish; 80-89 strong with limited issues; 70-79 usable but several noticeable issues; 60-69 material visual friction; 40-59 substantial hierarchy/readability/responsive problems; 0-39 severe visual usability failures. Score only observed visual quality, not technical SEO/performance. Unknown coverage must be disclosed. Include only findings with confidence >=0.65. Return JSON only.`;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...imageParts] }],
        text: { format: { type: "json_object" } }, max_output_tokens: 6000,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      return json({ error: `OpenAI visual analysis failed (${response.status}): ${detail.slice(0, 500)}` }, response.status === 429 ? 429 : 502);
    }
    const payload = await response.json();
    const outputText = payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("The vision model returned no structured output.");
    const result = parseOutput(JSON.parse(outputText));
    const visualAudit = {
      status: inspected.length === pages.length ? "completed" : "partial",
      visual_score: result.visual_score, score_explanation: result.score_explanation,
      assessment: result.assessment, findings: result.findings, model,
      analyzed_at: new Date().toISOString(), analysis_version: "1.0",
      screenshot_coverage: { available: pages.length, inspected: inspected.length, pages: inspected },
      usage: payload.usage || null,
    };
    const { error: saveError } = await admin.from("website_analyses").update({
      analysis_details: { ...(audit.analysis_details || {}), visual_audit: visualAudit },
    }).eq("id", audit.id).eq("user_id", userData.user.id);
    if (saveError) throw saveError;
    return json({ visual_audit: visualAudit });
  } catch (error) {
    console.error("analyze-website-visuals:", error);
    return json({ error: error instanceof Error ? error.message : "Visual analysis failed." }, 500);
  }
});
