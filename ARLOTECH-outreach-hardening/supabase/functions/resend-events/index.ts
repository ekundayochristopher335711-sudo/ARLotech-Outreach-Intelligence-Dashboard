import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isSupportedResendEventType, parseResendProviderEvent, verifyResendWebhookSignature } from './helpers.ts'

const MAX_WEBHOOK_BODY_LENGTH = 1_000_000

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function readBoundedBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_LENGTH) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalLength += value.length
      if (totalLength > MAX_WEBHOOK_BODY_LENGTH) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return null
  }
}

serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const webhookSecret = Deno.env.get('RESEND_EVENTS_WEBHOOK_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
      console.error('Resend event function is missing required server-side configuration.')
      return jsonResponse({ error: 'Webhook processing is not configured.' }, 500)
    }

    const rawBody = await readBoundedBody(request)
    if (rawBody === null) return jsonResponse({ error: 'Webhook request is too large or is not valid UTF-8.' }, 413)
    const signatureHeaders = {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    }
    if (!await verifyResendWebhookSignature(signatureHeaders, rawBody, webhookSecret)) {
      return jsonResponse({ error: 'Invalid or expired webhook signature.' }, 401)
    }

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return jsonResponse({ error: 'Invalid webhook payload.' }, 400)
    }
    if (!payload || typeof payload !== 'object' || !('type' in payload)) {
      return jsonResponse({ error: 'Webhook event type is missing.' }, 400)
    }
    if (!isSupportedResendEventType(payload.type)) return jsonResponse({ received: true, ignored: true })

    const event = parseResendProviderEvent(payload)
    if (!event) return jsonResponse({ error: 'Invalid Resend event payload.' }, 400)
    const providerEventId = signatureHeaders.id
    if (!providerEventId) return jsonResponse({ error: 'Webhook event identifier is missing.' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await supabase.rpc('record_resend_provider_event', {
      p_provider_event_id: providerEventId,
      p_event_type: event.eventType,
      p_provider_message_id: event.providerMessageId,
      p_recipient_email: event.recipientEmails[0] ?? null,
      p_occurred_at: event.occurredAt,
      p_event_status: event.eventStatus,
      p_suppression_origin: event.suppressionOrigin,
      p_reason: event.reason,
    })
    if (error) {
      console.error('Could not persist Resend provider event.', error.code)
      return jsonResponse({ error: 'Could not persist provider event.' }, 500)
    }

    const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    return jsonResponse({ received: true, ...result })
  } catch (error) {
    console.error('Resend event processing failed.', error instanceof Error ? error.message : 'Unknown error')
    return jsonResponse({ error: 'Webhook processing failed.' }, 500)
  }
})