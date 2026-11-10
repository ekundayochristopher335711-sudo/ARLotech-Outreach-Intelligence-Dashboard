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

    const result = await generateOpenAIJson(prompt)
    const subject = result.parsed.subject
    const emailBody = result.parsed.body
    if (typeof subject !== 'string' || typeof emailBody !== 'string') {
      throw new Error('OpenAI response did not contain a valid subject and body')
    }
    return new Response(JSON.stringify({ subject, body: emailBody }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
