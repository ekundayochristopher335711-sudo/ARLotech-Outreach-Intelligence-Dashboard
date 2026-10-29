import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured')
    const body = await req.json()
    const businessName = String(body?.business_name ?? 'Prospect')
    const website = String(body?.website ?? '')
    const contactName = body?.contact_name ? String(body.contact_name) : null
    const score = body?.overall_score ?? null
    const findings = Array.isArray(body?.findings) ? body.findings : []
    const positives = Array.isArray(body?.positive_observations) ? body.positive_observations : []

    const topIssues = findings.slice(0, 8).map((f: any) => `- ${f.title}${f.evidence ? ` (${f.evidence})` : ''}`).join('\n')

    const prompt = `You are an outreach copywriter for a web/SEO agency. Write a personalized cold outreach email to ${contactName ?? 'the business owner'} at ${businessName} (${website}).

Website audit score: ${score ?? 'N/A'}/100.
Top issues found:
${topIssues || '- No major issues captured'}
Positive observations:
${positives.map((p: any) => `- ${p.title}`).join('\n') || '- None captured'}

Requirements:
- Professional, concise, non-spammy.
- Mention 2-3 specific issues from the audit.
- Mention that the attached PDF contains the full audit (score, evidence, and recommended fixes) and invite the recipient to review it.
- Offer a quick call or audit review.
- Include a clear CTA.
- Return ONLY valid JSON: { "subject": string, "body": string } where body is plain text email (no markdown).`

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest']
    let lastError: Error | null = null
    for (const modelName of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, responseMimeType: 'application/json' },
        }),
      })
      if (!res.ok) { lastError = new Error(`Gemini error ${res.status}`); continue }
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      let parsed: any = null
      try {
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
        parsed = JSON.parse(cleaned)
      } catch { parsed = null }
      if (!parsed?.subject || !parsed?.body) {
        // fallback
        parsed = { subject: `Quick website improvements for ${businessName}`, body: raw }
      }
      return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    throw lastError || new Error('No Gemini model available')
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
