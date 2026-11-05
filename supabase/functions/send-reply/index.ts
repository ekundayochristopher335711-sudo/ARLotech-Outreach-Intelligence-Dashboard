import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveReplyToAddress } from '../send-outreach/eligibility.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

function replyHtml(body: string) {
  const paragraphs = body.trim().split(/\n\s*\n/).map((paragraph) =>
    `<p style="margin:0 0 16px;color:#334155;font:15px/1.7 Arial,Helvetica,sans-serif;white-space:pre-line">${escapeHtml(paragraph.trim())}</p>`,
  ).join('')

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:24px;background:#f1f5f9">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px">
      <tr><td style="padding:28px">${paragraphs}</td></tr>
      <tr><td style="padding:0 28px 20px;color:#64748b;font:12px/1.5 Arial,Helvetica,sans-serif">Arlotech Digital Solutions</td></tr>
    </table>
  </body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return jsonResponse({ error: 'Sign in before sending a reply.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase function authentication is not configured.')
    if (!resendApiKey || !fromEmail) {
      throw new Error('Set RESEND_API_KEY and RESEND_FROM_EMAIL as Supabase function secrets before sending.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData.user) return jsonResponse({ error: 'Your session is invalid or expired.' }, 401)
    const userId = userData.user.id

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'The reply request is not valid JSON.' }, 400)
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('messageId' in body) ||
      typeof body.messageId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.messageId) ||
      !('body' in body) ||
      typeof body.body !== 'string' ||
      !body.body.trim() ||
      body.body.length > 12_000
    ) {
      return jsonResponse({ error: 'Choose a received message and enter a reply of no more than 12,000 characters.' }, 400)
    }

    const { data: inboundMessage, error: messageLookupError } = await supabase
      .from('email_messages')
      .select('id, prospect_id, sender_email, subject')
      .eq('id', body.messageId)
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .maybeSingle()
    if (messageLookupError) throw messageLookupError
    if (!inboundMessage) return jsonResponse({ error: 'The received message was not found in your account.' }, 404)

    const recipient = inboundMessage.sender_email?.trim().toLowerCase()
    if (!recipient || !EMAIL_PATTERN.test(recipient)) {
      return jsonResponse({ error: 'This received message does not have a valid sender address.' }, 422)
    }

    const replyTo = resolveReplyToAddress(Deno.env.get('OUTREACH_REPLY_TO_EMAIL') ?? null, fromEmail)
    if (!replyTo) return jsonResponse({ error: 'The configured reply address is invalid.' }, 500)

    const subject = inboundMessage.subject?.trim() || 'your message'
    const replySubject = (/^re:/i.test(subject) ? subject : `Re: ${subject}`)
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 200)
    const replyBody = body.body.trim()
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        reply_to: replyTo,
        to: [recipient],
        subject: replySubject,
        text: replyBody,
        html: replyHtml(replyBody),
      }),
    })
    const resendBody = await resendResponse.json().catch(() => ({}))
    if (!resendResponse.ok || typeof resendBody?.id !== 'string') {
      const detail = typeof resendBody?.message === 'string'
        ? resendBody.message
        : `Resend rejected the reply (${resendResponse.status}).`
      return jsonResponse({ error: detail }, 502)
    }

    const sentAt = new Date().toISOString()
    const { error: saveError } = await supabase.from('email_messages').insert({
      user_id: userId,
      prospect_id: inboundMessage.prospect_id,
      recipient_email: recipient,
      sender_email: fromEmail,
      provider: 'resend',
      provider_message_id: resendBody.id,
      direction: 'outbound',
      subject: replySubject,
      body: replyBody,
      status: 'sent',
      sent_at: sentAt,
    })
    const trackingErrors: string[] = []
    if (saveError) trackingErrors.push(`message history: ${saveError.message}`)

    const { error: activityError } = await supabase.from('activity_logs').insert({
      user_id: userId,
      prospect_id: inboundMessage.prospect_id,
      event_type: 'email_replied',
      description: `Email reply sent to ${recipient} via Resend.`,
      metadata: { provider_message_id: resendBody.id, recipient_email: recipient },
    })
    if (activityError) trackingErrors.push(`activity log: ${activityError.message}`)

    return jsonResponse({
      sent: true,
      ...(trackingErrors.length ? { tracking_error: trackingErrors.join('; ') } : {}),
    })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'The reply could not be sent.' },
      500,
    )
  }
})
