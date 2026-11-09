import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { htmlToText, normalizedEmail } from './helpers.ts'

const MAX_WEBHOOK_BODY_LENGTH = 1_000_000
const MAX_STORED_BODY_LENGTH = 50_000
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

interface ReceivedEvent {
  type: string
  created_at?: string
  data?: {
    email_id?: string
    from?: string
    created_at?: string
    subject?: string
  }
}

interface ReceivedEmail {
  id?: string
  from?: string
  subject?: string
  text?: string | null
  html?: string | null
  created_at?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function decodeBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

async function verifyWebhookSignature(request: Request, rawBody: string, secret: string) {
  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signatures = request.headers.get('svix-signature')
  if (!id || !timestamp || !signatures || !secret.startsWith('whsec_')) return false

  const timestampSeconds = Number(timestamp)
  if (
    !Number.isInteger(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false
  }

  try {
    const signingKey = await crypto.subtle.importKey(
      'raw',
      decodeBase64(secret.slice('whsec_'.length)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signedPayload = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
    const expectedSignature = new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, signedPayload))

    return signatures.split(' ').some((signature) => {
      const [version, encodedSignature] = signature.split(',', 2)
      if (version !== 'v1' || !encodedSignature) return false
      try {
        return equalBytes(expectedSignature, decodeBase64(encodedSignature))
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!webhookSecret || !resendApiKey || !supabaseUrl || !serviceRoleKey) {
      console.error('Resend inbound function is missing required server-side configuration.')
      return jsonResponse({ error: 'Webhook processing is not configured.' }, 500)
    }

    const rawBody = await request.text()
    if (rawBody.length > MAX_WEBHOOK_BODY_LENGTH) {
      return jsonResponse({ error: 'Webhook request is too large.' }, 413)
    }
    if (!await verifyWebhookSignature(request, rawBody, webhookSecret)) {
      return jsonResponse({ error: 'Invalid webhook signature.' }, 401)
    }

    let event: ReceivedEvent
    try {
      event = JSON.parse(rawBody) as ReceivedEvent
    } catch {
      return jsonResponse({ error: 'Invalid webhook payload.' }, 400)
    }
    if (event.type !== 'email.received') return jsonResponse({ received: true, ignored: true })

    const emailId = event.data?.email_id
    if (typeof emailId !== 'string' || !/^[0-9a-f-]{36}$/i.test(emailId)) {
      return jsonResponse({ error: 'Received email identifier is invalid.' }, 400)
    }

    const receivedResponse = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      { headers: { Authorization: `Bearer ${resendApiKey}` } },
    )
    if (!receivedResponse.ok) {
      console.error('Resend could not return inbound email content.', receivedResponse.status)
      return jsonResponse({ error: 'Could not retrieve received email content from Resend.' }, 502)
    }
    const receivedEmail = await receivedResponse.json() as ReceivedEmail
    if (receivedEmail.id && receivedEmail.id !== emailId) {
      return jsonResponse({ error: 'Retrieved email does not match the webhook event.' }, 502)
    }

    const senderEmail = normalizedEmail(receivedEmail.from ?? event.data?.from)
    if (!senderEmail) return jsonResponse({ error: 'Received email sender is invalid.' }, 422)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: sentMessage, error: matchError } = await supabase
      .from('email_messages')
      .select('user_id, prospect_id')
      .eq('direction', 'outbound')
      .eq('status', 'sent')
      .eq('recipient_email', senderEmail)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (matchError) {
      console.error('Could not match inbound sender to sent outreach.', matchError.message)
      return jsonResponse({ error: 'Could not match the reply to its sent email.' }, 500)
    }
    if (!sentMessage) {
      console.info('Ignoring inbound email because its sender does not match a recorded outreach recipient.')
      return jsonResponse({ received: true, ignored: true, reason: 'no_matching_outreach' })
    }

    const messageBody = (receivedEmail.text?.trim() || (receivedEmail.html ? htmlToText(receivedEmail.html) : ''))
      .slice(0, MAX_STORED_BODY_LENGTH)
    const receivedAt = receivedEmail.created_at ?? event.data?.created_at ?? event.created_at ?? new Date().toISOString()
    const { error: insertError } = await supabase.from('email_messages').insert({
      user_id: sentMessage.user_id,
      prospect_id: sentMessage.prospect_id,
      provider: 'resend',
      provider_message_id: emailId,
      sender_email: senderEmail,
      direction: 'inbound',
      subject: receivedEmail.subject ?? event.data?.subject ?? '',
      body: messageBody,
      status: 'received',
      received_at: receivedAt,
    })
    if (insertError && insertError.code !== '23505') {
      console.error('Could not store received email.', insertError.message)
      return jsonResponse({ error: 'Could not save the received email.' }, 500)
    }

    return jsonResponse({ received: true, duplicate: insertError?.code === '23505' })
  } catch (error) {
    console.error('Resend inbound webhook processing failed.', error instanceof Error ? error.message : 'Unknown error')
    return jsonResponse({ error: 'Webhook processing failed.' }, 500)
  }
})
