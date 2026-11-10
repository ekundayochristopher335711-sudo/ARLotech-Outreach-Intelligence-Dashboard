import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateOpenAIJson } from '../_shared/openai.ts'
import { recordOpenAICost } from '../_shared/costTracking.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getCurrentUserId(req: Request): Promise<string | null> {
  const authorization = req.headers.get('Authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (!supabaseUrl || !supabaseKey) return null
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data } = await supabase.auth.getUser()
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { url, content, pagespeed } = body
    const userId = await getCurrentUserId(req)
    if (!url) throw new Error('url is required')
    const visualScreenshots = (Array.isArray(body.visualScreenshots) ? body.visualScreenshots : [])
      .slice(0, 8)
      .filter((image: any) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(image?.mime_type) &&
        typeof image?.data === 'string' &&
        image.data.length <= 1_000_000 &&
        image.data.length % 4 === 0 &&
        typeof image?.page_url === 'string' &&
        image.page_url.length <= 2048 &&
        typeof image?.page_label === 'string' &&
        image.page_label.length <= 100 &&
        ['desktop', 'mobile'].includes(image?.viewport) &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(image.data),
      )

    const categories = pagespeed?.lighthouseResult?.categories || {}
    const audits = pagespeed?.lighthouseResult?.audits || {}
    const scoringAuditIds = new Set(
      Object.values(categories).flatMap((category: any) =>
        (Array.isArray(category?.auditRefs) ? category.auditRefs : [])
          .filter((ref: any) => typeof ref?.id === 'string' && typeof ref?.weight === 'number' && ref.weight > 0)
          .map((ref: any) => ref.id),
      ),
    )
    const scoredIssues = Object.entries(audits)
      .filter(([id, audit]: [string, any]) =>
        scoringAuditIds.has(id) && typeof audit?.score === 'number' && audit.score >= 0 && audit.score < 1,
      )
      .slice(0, 20)
      .map(([id, audit]: [string, any]) => `- ${id}: ${audit.title ?? id}; score ${audit.score}; ${audit.displayValue ?? 'no display value'}`)
    const opportunities = Object.entries(audits)
      .filter(([id, audit]: [string, any]) =>
        !scoringAuditIds.has(id) && audit?.details?.type === 'opportunity',
      )
      .slice(0, 10)
      .map(([id, audit]: [string, any]) => `- ${id}: ${audit.title ?? id}; ${audit.displayValue ?? 'no display value'}`)

// ---------------------------------------------------------------------------
// Two-stage visual analysis helpers
// ---------------------------------------------------------------------------

// Fingerprint for near-duplicate detection (mirrors the frontend helper so the
// edge function can deduplicate before spending tokens on OpenAI).
function screenshotFingerprint(image: any): string {
  const len = typeof image.data === 'string' ? image.data.length : 0
  const head = typeof image.data === 'string' ? image.data.slice(0, 32) : ''
  const tail = typeof image.data === 'string' ? image.data.slice(-32) : ''
  return `${image.mime_type}|${image.viewport}|${len}|${head}|${tail}`
}

function selectUniqueScreenshots(images: any[]): { selected: any[]; skipped: any[] } {
  const seen = new Set<string>()
  const selected: any[] = []
  const skipped: any[] = []
  const byPage = new Map<string, any[]>()
  for (const s of images) {
    const list = byPage.get(s.page_url) ?? []
    list.push(s)
    byPage.set(s.page_url, list)
  }
  for (const [, pages] of byPage) {
    pages.sort((a: any, b: any) => (a.viewport === 'desktop' ? -1 : 1) - (b.viewport === 'desktop' ? -1 : 1))
    for (const s of pages) {
      const fp = screenshotFingerprint(s)
      if (seen.has(fp)) {
        skipped.push(s)
        continue
      }
      seen.add(fp)
      selected.push(s)
    }
  }
  return { selected, skipped }
}

const SERIOUS_SEVERITY = new Set(['high'])
const UNCERTAINTY_SIGNALS = ['unclear', 'uncertain', 'conflict', 'conflicting', 'cannot determine', 'needs closer']

function stage2Warranted(observations: any[]): boolean {
  for (const obs of observations) {
    if (SERIOUS_SEVERITY.has(obs.severity)) return true
    const text = `${obs.title ?? ''} ${obs.evidence ?? ''} ${obs.why_it_matters ?? ''}`.toLowerCase()
    if (UNCERTAINTY_SIGNALS.some((signal) => text.includes(signal))) return true
  }
  return false
}

function desktopMobileConflict(observations: any[]): boolean {
  const pages = new Map<string, Set<string>>()
  for (const obs of observations) {
    const set = pages.get(obs.page_url) ?? new Set()
    set.add(obs.viewport)
    pages.set(obs.page_url, set)
  }
  for (const [page, viewports] of pages) {
    if (viewports.size === 2) {
      const desktopObs = observations.filter((o) => o.page_url === page && o.viewport === 'desktop')
      const mobileObs = observations.filter((o) => o.page_url === page && o.viewport === 'mobile')
      if (desktopObs.length > 0 && mobileObs.length === 0) return true
      if (mobileObs.length > 0 && desktopObs.length === 0) return true
    }
  }
  return false
}

function deduplicateObservations(observations: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const obs of observations) {
    const key = `${obs.page_url}|${obs.viewport}|${(obs.title ?? '').trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(obs)
  }
  return out
}

// Parses the structured text output from the visual auditor system prompt into
// observation objects that match the existing VisualObservation interface.
function parseTextVisualObservations(text: string): any[] {
  const observations: any[] = []
  const lines = text.split('\n')
  let current: any = null

  function flushCurrent() {
    if (current && current.title && current.severity && current.visual_evidence) {
      observations.push({
        title: current.title.trim(),
        evidence: current.visual_evidence.trim(),
        why_it_matters: current.why_it_matters?.trim() || '',
        severity: normalizeSeverity(current.severity.trim()),
        confidence: parseConfidence(current.confidence?.trim()),
        recommended_fix: current.recommended_fix?.trim() || '',
        category: current.category?.trim() || 'visual',
        device: current.device?.trim() || 'all_devices',
        location: current.location?.trim() || '',
      })
    }
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s+/, '').replace(/\s+$/, '')
    if (!line) continue

    const lower = line.toLowerCase()
    if (lower.startsWith('issue title:')) {
      flushCurrent()
      current = { title: line.replace(/^issue title:\s*/i, ''), visual_evidence: '' }
    } else if (lower.startsWith('category:')) {
      current.category = line.replace(/^category:\s*/i, '')
    } else if (lower.startsWith('severity:')) {
      current.severity = line.replace(/^severity:\s*/i, '')
    } else if (lower.startsWith('device:')) {
      current.device = line.replace(/^device:\s*/i, '')
    } else if (lower.startsWith('location:')) {
      current.location = line.replace(/^location:\s*/i, '')
    } else if (lower.startsWith('visual evidence:')) {
      current.visual_evidence = line.replace(/^visual\s+evidence:\s*/i, '')
    } else if (lower.startsWith('how it matters:') || lower.startsWith('why it matters:')) {
      current.why_it_matters = line.replace(/^how\s+it\s+matters:\s*/i, '').replace(/^why\s+it\s+matters:\s*/i, '')
    } else if (lower.startsWith('recommendation:')) {
      current.recommended_fix = line.replace(/^recommendation:\s*/i, '')
    } else if (lower.startsWith('confidence:')) {
      current.confidence = line.replace(/^confidence:\s*/i, '')
    } else {
      // Continuation line — append to the most recent known field.
      if (current) {
        if (current.visual_evidence) {
          current.visual_evidence += ' ' + line
        } else if (current.why_it_matters) {
          current.why_it_matters += ' ' + line
        } else if (current.recommended_fix) {
          current.recommended_fix += ' ' + line
        } else if (current.title) {
          current.title += ' ' + line
        }
      }
    }
  }
  flushCurrent()
  return observations
}

function normalizeSeverity(value: string): 'Critical' | 'High' | 'Medium' | 'Low' | null {
  const v = value.toLowerCase().trim()
  if (v === 'critical') return 'Critical'
  if (v === 'high') return 'High'
  if (v === 'medium') return 'Medium'
  if (v === 'low') return 'Low'
  return null
}

function parseConfidence(value: string): number | null {
  const v = value.trim().toLowerCase()
  if (v === 'high') return 0.85
  if (v === 'medium') return 0.6
  if (v === 'low') return 0.45
  const match = v.match(/(0\.[0-9]+|1\.0|0\.[0-9]+)/)
  if (match) return parseFloat(match[1])
  return null
}

const STAGE_ONE_SYSTEM_PROMPT = `You are an exceptionally experienced Senior UI/UX Designer, Digital Product Designer, Visual Design Critic, and Website Experience Auditor.
Your responsibility is to professionally examine website screenshots and identify visual design flaws, usability weaknesses, inconsistencies, and missed design opportunities.
You are not here to compliment websites or provide generic design advice.

IMPORTANT: You will receive actual screenshots captured from websites. These screenshots may represent desktop, tablet, or mobile versions of the same website.
Your job is to VISUALLY ANALYSE WHAT YOU ACTUALLY SEE.
Do not assume how the website works internally. Do not invent problems. Do not report technical issues that cannot be established from the available evidence.

ANALYSIS FRAMEWORK:
1. VISUAL HIERARCHY
- Is the most important content immediately noticeable?
- Are headings appropriately prominent?
- Is the visual hierarchy confusing?
- Are secondary elements competing with primary content?
- Is the visitor naturally guided through the page?

2. SPACING AND ALIGNMENT
- Inconsistent margins and padding.
- Poor vertical spacing between sections.
- Uneven alignment of elements.
- Excessive empty spaces.
- Overcrowded content.
- Inconsistent spacing between cards.
- Poor horizontal distribution.
- Elements that appear visually disconnected.

3. TYPOGRAPHY
- Inconsistent font sizes.
- Weak heading hierarchy.
- Poor font combinations.
- Text that is too small.
- Excessively large headings.
- Uncomfortable line heights.
- Poor paragraph readability.
- Inconsistent font weights.
- Text that blends into its background.

4. COLOUR AND VISUAL CONSISTENCY
- Poor colour combinations.
- Insufficient text contrast.
- Inconsistent accent colours.
- Unnecessary colour variations.
- Inconsistent button colours.
- Elements that visually clash.

5. COMPONENT DESIGN
Inspect individual components:
- Navigation bars.
- Buttons.
- Cards.
- Forms.
- Input fields.
- Dropdowns.
- Badges.
- Icons.
- Image containers.
- Footers.
- Call-to-action sections.
Identify inconsistent sizing, poor styling, awkward positioning, and weak component hierarchy.

6. IMAGE AND MEDIA PRESENTATION
- Poor image cropping.
- Inconsistent image proportions.
- Images that appear stretched.
- Poor image positioning.

7. PAGE COMPOSITION
- Poorly balanced sections.
- Weak section transitions.
- Excessive content density.
- Inconsistent section widths.
- Poor use of available screen space.

MOBILE SPECIFIC:
When mobile screenshots are provided, examine:
- Mobile navigation presentation.
- Header proportions.
- Content alignment.
- Button sizing.
- Touch-target visibility.
- Horizontal overflow when visible.
- Overall mobile composition.

DESKTOP SPECIFIC:
- Use of available screen space.
- Content width.
- Header proportions.
- Hero section composition.
- Navigation arrangement.
- Grid consistency.
- Column alignment.
- Typography hierarchy.
- Image-to-text balance.
- Footer composition.

GENERAL RULES:
- Never invent a UI problem.
- Never report a generic issue without identifying its visual evidence.
- Never claim an element is broken simply because it looks unusual.
- Never confuse personal design preferences with genuine usability problems.
- Assign each confirmed issue a severity: Critical, High, Medium, or Low.
- For every issue, provide: ISSUE TITLE, CATEGORY, SEVERITY, DEVICE, LOCATION, VISUAL EVIDENCE, WHY IT MATTERS, RECOMMENDATION, CONFIDENCE.

OUTPUT FORMAT:
For every identified issue, provide the following lines exactly as shown (you may output multiple issues):
ISSUE TITLE: <concise title>
CATEGORY: <relevant UI/UX category>
SEVERITY: Critical, High, Medium, or Low
DEVICE: Desktop, Mobile, Tablet, or All Devices
LOCATION: <exact section or component>
VISUAL EVIDENCE: <describe what is visibly wrong in the screenshot>
WHY IT MATTERS: <how the issue negatively affects the visitor's experience>
RECOMMENDATION: <specific, professionally actionable design improvement>
CONFIDENCE: High, Medium, or Low

After all issues, provide these sections:
OVERALL DESIGN IMPRESSION: <professional assessment>
STRONGEST DESIGN ELEMENTS: <genuinely well-executed elements>
BIGGEST DESIGN WEAKNESSES: <most important visual problems>
DESKTOP ASSESSMENT: <summary of desktop experience>
MOBILE ASSESSMENT: <summary of mobile experience>
TOP PRIORITY IMPROVEMENTS: <five most important improvements ordered by importance>
FINAL PROFESSIONAL VERDICT: <polished, average, inconsistent, outdated, or poorly executed, justified>

Do not include markdown code blocks, JSON fences, or any formatting other than plain text with the field labels above.`)

function buildStage2Prompt(screenshots: any[], previousObservations: any[]): string {
  const targets = previousObservations
    .filter((o: any) => o.needs_review === true || SERIOUS_SEVERITY.has(o.severity))
    .slice(0, 5)
  const targetList = targets.map((o: any) => `- ${o.page_url} | ${o.viewport}: ${o.title} — ${o.evidence}`).join('\n')
  return `You are conducting a TARGETED SECOND-STAGE visual investigation for Arlotech Digital Solutions.

The first-stage review flagged the following observations as needing closer inspection:
${targetList || 'No specific targets.'}

STAGE TWO INPUT — Re-examine these specific screenshots at higher detail:
${screenshots.map((image: any, index: number) => `${index + 1}. ${image.page_label} | ${image.page_url} | ${image.viewport}`).join('\n')}

For each flagged screenshot, determine whether the suspected defect is:
- CONFIRMED: clearly visible and real (keep the finding, possibly adjust severity)
- REFUTED: not actually a problem on closer inspection (suppress the finding)
- UNCLEAR: still uncertain (keep as low-confidence, flag for manual review)

Do not invent defects. If closer inspection shows the issue does not exist, explicitly suppress it.
Distinguish actual UI defects from subjective design recommendations.

Return ONLY valid JSON (no markdown) with this shape:
{
  "stage_two_conclusion": "brief summary of what was confirmed or refuted",
  "updated_observations": [
    {
      "page_url": "exact URL from the screenshot list",
      "viewport": "desktop or mobile",
      "title": "concise visible issue",
      "evidence": "what is visibly confirmed or refuted",
      "why_it_matters": "visitor impact",
      "severity": "high, medium, or low",
      "confidence": 0.0,
      "recommended_fix": "specific follow-up",
      "suppressed": false
    }
  ]
}`
}


    const startTime = Date.now()

    // --- Deduplicate screenshots before any OpenAI call ---
    const { selected: uniqueScreenshots, skipped: duplicateScreenshots } = selectUniqueScreenshots(visualScreenshots)

    // --- STAGE ONE: General visual analysis ---
    // System prompt is the UI/UX visual auditor; actual screenshots are sent alongside to the vision model.
    const stage1 = await generateOpenAIJson(
      `Analyze the following website screenshots for visual UI/UX design issues.
Website: ${content?.finalUrl ?? content?.url ?? 'unknown'}
${uniqueScreenshots.length > 0 ? 'Screenshots:' : 'No screenshots supplied — analyze only the HTML/text content and state that no visual evidence exists.'}
${uniqueScreenshots.map((s: any, i: number) => `${i + 1}. ${s.page_label} | ${s.page_url} | ${s.viewport}`).join('\n')}`,
      uniqueScreenshots,
      {
        system_prompt: STAGE_ONE_SYSTEM_PROMPT,
        image_detail: 'low',
        timeout_ms: 60_000,
        max_retries: 2,
        text_mode: true,
      },
    )

    const stage1Observations = parseTextVisualObservations(stage1.text)
    stage1.parsed = null

    // --- STAGE TWO: Targeted investigation (only when warranted) ---
    let stage2Result: any = null
    const stage2Screenshots: any[] = []
    let stage2Observations: any[] = []

    const warranted = stage2Warranted(stage1Observations) || desktopMobileConflict(stage1Observations)

    if (warranted && uniqueScreenshots.length > 0) {
      const flaggedKeys = new Set<string>()
      for (const obs of stage1Observations) {
        if ((obs as any).severity === 'Critical' || (obs as any).severity === 'High' || (obs as any).needs_review === true) {
          flaggedKeys.add(`${(obs as any).page_url}|${(obs as any).viewport}`)
        }
      }
      for (const s of uniqueScreenshots) {
        if (flaggedKeys.has(`${s.page_url}|${s.viewport}`)) {
          stage2Screenshots.push(s)
        }
      }

      if (stage2Screenshots.length > 0) {
        const stage2Text = await generateOpenAIJson(
          `Re-examine these specific website screenshots at higher detail.
Website: ${content?.finalUrl ?? content?.url ?? 'unknown'}
For each flagged screenshot, confirm, refute, or mark as unclear.
Flagged items:\n${stage1Observations.map((o: any) => `- ${o.page_url} | ${o.viewport} | ${o.title} | ${o.evidence}`).join('\n')}
Screenshots to re-examine: ${stage2Screenshots.map((s: any, i: number) => `${i + 1}. ${s.page_label} | ${s.page_url} | ${s.viewport}`).join('\n')}`,
          stage2Screenshots,
          {
            system_prompt: STAGE_ONE_SYSTEM_PROMPT,
            image_detail: 'high',
            timeout_ms: 60_000,
            max_retries: 2,
            text_mode: true,
          },
        )
        stage2Observations = parseTextVisualObservations(stage2Text)
        stage2Result = { conclusion: stage2Text.slice(0, 500), observations: stage2Observations }
        stage2Result.parsed = null
      }
    }

    // --- Consolidate findings ---
    const mergedObservations = [...stage1Observations, ...stage2Observations]
    const finalObservations = deduplicateObservations(mergedObservations).slice(0, 15)

    const result = {
      ...stage1,
      parsed: {
        ...stage1.parsed,
        visual_observations: finalObservations,
        stage_two: stage2Result?.observations ? {
          conclusion: stage2Result.conclusion,
          targeted_screenshots: stage2Screenshots.length,
        } : {},
        duplicate_screenshots_skipped: duplicateScreenshots.length,
      },
    }

    // Record cost/usage to activity_logs (does not reveal or read credit balance).
    if (userId) {
      const durationMs = result.duration_ms ?? Date.now() - startTime
      await recordOpenAICost({
        user_id: userId,
        operation: 'website_analysis',
        model: result.model,
        input_tokens: result.usage.prompt_tokens,
        output_tokens: result.usage.completion_tokens,
        image_tokens: visualScreenshots.length > 0 ? null : null,
        duration_ms: durationMs,
        status: 'completed',
        website_url: url,
      }).catch(() => {
        // Cost tracking must never break the primary request.
      })
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    const userIdForError = await getCurrentUserId(req).catch(() => null)
    if (userIdForError) {
      await recordOpenAICost({
        user_id: userIdForError,
        operation: 'website_analysis',
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-6-luna',
        input_tokens: null,
        output_tokens: null,
        duration_ms: 0,
        status: 'failed',
        website_url: url,
      }).catch(() => {
        // Cost tracking must never break the primary request.
      })
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
