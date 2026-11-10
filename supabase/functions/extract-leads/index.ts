import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { generateOpenAIJson } from '../_shared/openai.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
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

    const result = await generateOpenAIJson(prompt)
    const leads = result.parsed.leads
    if (!Array.isArray(leads)) throw new Error('OpenAI response did not contain a leads array')
    return new Response(JSON.stringify({ leads }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
