import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured')

    const body = await req.json()
    const { url, content, pagespeed } = body
    if (!url) throw new Error('url is required')

    // Candidate models in priority order. We try each until one succeeds,
    // so the function keeps working even if a model is retired/renamed.
    const requestedModel = typeof body?.model === 'string' ? body.model : null

    // Discover the models this key can actually use, so we never guess wrong names.
    let availableModels: string[] = []
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=1000`)
      if (listRes.ok) {
        const listData = await listRes.json()
        availableModels = (listData?.models ?? [])
          .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => String(m.name).replace(/^models\//, ''))
          .filter((name: string) => /gemini/i.test(name))
          .filter((name: string) => !/tts|audio|image|embedding|aqa/i.test(name))
          .filter(Boolean)
      }
    } catch { /* ignore; fall back to static list */ }

    const staticModels = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro',
    ]

    const candidateModels = requestedModel
      ? [requestedModel]
      : (availableModels.length ? availableModels.slice().sort((a: string, b: string) => {
          const af = /flash/i.test(a) ? 0 : 1
          const bf = /flash/i.test(b) ? 0 : 1
          if (af !== bf) return af - bf
          return b.localeCompare(a)
        }) : staticModels)

    const prompt = `You are an SEO and web performance expert. Analyze the following website and provide a structured report.

Website URL: ${url}

Extracted content summary:
- Title: ${content?.title ?? 'N/A'}
- Meta description: ${content?.metaDescription ?? 'N/A'}
- H1 count: ${content?.h1Count ?? 0}
- Word count: ${content?.wordCount ?? 0}
- Internal links: ${content?.links?.internal ?? 0}, External: ${content?.links?.external ?? 0}
- Images: ${content?.images?.total ?? 0} (missing alt: ${content?.images?.missingAlt ?? 0})
- Has canonical: ${!!content?.canonical}
- Has viewport: ${!!content?.viewport}
- Schema.org scripts: ${content?.schema?.length ?? 0}
- Text excerpt: ${(content?.textExcerpt ?? '').slice(0, 1500)}

PageSpeed / Lighthouse (desktop) category scores (0-1):
${Object.entries(pagespeed?.lighthouseResult?.categories || {})
  .map(([k, v]: any) => `- ${k}: ${v?.score ?? 'N/A'}`)
  .join('\n')}

Top failed audits:
${Object.values(pagespeed?.lighthouseResult?.audits || {})
  .filter((a: any) => a?.score !== null && a?.score < 1)
  .slice(0, 15)
  .map((a: any) => `- ${a.title} (${a.displayValue ?? ''})`)
  .join('\n')}

Return ONLY valid JSON (no markdown) with this shape:
{
  "summary": "short overall summary",
  "score_explanation": "why the score is what it is",
  "recommendations": ["actionable recommendation 1", "..."],
  "seo_notes": ["seo-specific note 1", "..."],
  "content_notes": ["content-specific note 1", "..."],
  "positive_observations": ["positive 1", "..."]
}`

    let lastError: Error | null = null
    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`

      const geminiRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      })

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text()
        lastError = new Error(`Gemini API error (${modelName}): ${geminiRes.status} - ${errBody}`)
        // Try next model on 404/NOT_FOUND, 400 (capability mismatch), 429 (rate limit), or 503 (overloaded); otherwise stop.
        if ([404, 400, 429, 500, 503].includes(geminiRes.status)) continue
        throw lastError
      }

      const geminiData = await geminiRes.json()
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

      let parsed: any = null
      try {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = null
      }

      return new Response(
        JSON.stringify({ text: rawText, parsed, model: modelName }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const hint = availableModels.length ? ` Available models: ${availableModels.join(', ')}` : ''
    throw new Error((lastError?.message ?? 'No Gemini model available') + hint)
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
