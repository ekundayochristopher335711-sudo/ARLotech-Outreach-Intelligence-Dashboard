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
    const text = String(body?.text ?? '').trim()
    if (!text) throw new Error('text is required')

    const prompt = `You are a data extraction assistant. Extract business leads from the following raw text (which may come from Google Maps, a directory, or a plain list). Return ONLY valid JSON: { "leads": [ { "business_name": string, "contact_name": string|null, "email": string|null, "website": string|null, "business_category": string|null, "city": string|null, "country": string|null, "phone": string|null, "linkedin_url": string|null, "notes": string|null, "source": string|null, "status": "New", "do_not_contact": false } ] }.

Rules:
- Only include entries that look like real businesses.
- Extract website URLs/domains whenever present (including links following a "Website" label or button); normalize to include https:// when possible.
- If a field is missing, use null.
- Do not invent emails/phones/websites; only extract if present.
- Keep notes concise and mention source context.

TEXT:
${text.slice(0, 12000)}`

    let availableModels: string[] = []
    try {
      const listResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}&pageSize=1000`,
      )
      if (listResponse.ok) {
        const listData = await listResponse.json()
        availableModels = (listData?.models ?? [])
          .filter((model: any) =>
            Array.isArray(model?.supportedGenerationMethods) &&
            model.supportedGenerationMethods.includes('generateContent'),
          )
          .map((model: any) => String(model.name).replace(/^models\//, ''))
          .filter((name: string) => /gemini/i.test(name))
          .filter((name: string) => !/tts|audio|image|embedding|aqa/i.test(name))
          .filter(Boolean)
      }
    } catch {
      // Fall back to known model IDs if model discovery is unavailable.
    }

    const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
    const models = availableModels.length
      ? availableModels.slice().sort((left: string, right: string) => {
          const leftFlash = /flash/i.test(left) ? 0 : 1
          const rightFlash = /flash/i.test(right) ? 0 : 1
          if (leftFlash !== rightFlash) return leftFlash - rightFlash
          return right.localeCompare(left)
        })
      : fallbackModels
    let lastError: Error | null = null
    for (const modelName of models) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      })
      if (!res.ok) {
        const errorBody = await res.text()
        lastError = new Error(`Gemini API error (${modelName}): ${res.status} - ${errorBody}`)
        if ([400, 404, 429, 500, 503].includes(res.status)) continue
        throw lastError
      }
      const data = await res.json()
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      let parsed: any = null
      try {
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
        parsed = JSON.parse(cleaned)
      } catch {
        parsed = null
      }
      const leads = Array.isArray(parsed?.leads) ? parsed.leads : []
      return new Response(JSON.stringify({ leads }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const modelHint = availableModels.length
      ? ''
      : ' Model discovery was unavailable; check that GEMINI_API_KEY is valid and can access a supported Gemini model.'
    throw new Error((lastError?.message ?? 'No Gemini model available') + modelHint)
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
