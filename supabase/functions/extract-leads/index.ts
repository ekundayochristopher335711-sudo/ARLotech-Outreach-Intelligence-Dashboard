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
- Normalize website URLs to include https:// when possible.
- If a field is missing, use null.
- Do not invent emails/phones; only extract if present.
- Keep notes concise and mention source context.

TEXT:
${text.slice(0, 12000)}`

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest']
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
        lastError = new Error(`Gemini error ${res.status}`)
        continue
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
    throw lastError || new Error('No Gemini model available')
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
