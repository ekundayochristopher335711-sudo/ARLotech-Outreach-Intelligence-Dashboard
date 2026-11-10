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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const userId = await getCurrentUserId(req)
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

    const startTime = Date.now()
    const result = await generateOpenAIJson(prompt, [], {
      timeout_ms: 60_000,
      max_retries: 2,
    })
    const subject = result.parsed.subject
    const emailBody = result.parsed.body
    if (typeof subject !== 'string' || typeof emailBody !== 'string') {
      throw new Error('OpenAI response did not contain a valid subject and body')
    }

    // Record cost/usage to activity_logs (does not reveal or read credit balance).
    if (userId) {
      const durationMs = result.duration_ms ?? Date.now() - startTime
      await recordOpenAICost({
        user_id: userId,
        operation: 'outreach_generation',
        model: result.model,
        input_tokens: result.usage.prompt_tokens,
        output_tokens: result.usage.completion_tokens,
        duration_ms: durationMs,
        status: 'completed',
      }).catch(() => {
        // Cost tracking must never break the primary request.
      })
    }

    return new Response(JSON.stringify({ subject, body: emailBody }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    const userIdForError = await getCurrentUserId(req).catch(() => null)
    if (userIdForError) {
      await recordOpenAICost({
        user_id: userIdForError,
        operation: 'outreach_generation',
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-6-luna',
        input_tokens: null,
        output_tokens: null,
        duration_ms: 0,
        status: 'failed',
      }).catch(() => {
        // Cost tracking must never break the primary request.
      })
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
