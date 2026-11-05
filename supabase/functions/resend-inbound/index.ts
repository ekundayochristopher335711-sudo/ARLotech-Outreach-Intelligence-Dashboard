import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'
import {
  htmlToText,
  isTrustedPushEndpoint,
  normalizedEmail,
  notificationContent,
  trackedEmailEventType,
  type ResendTrackedEmailEvent,
} from './helpers.ts'

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

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

type ServiceClient = ReturnType<typeof createClient>

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function notifyUser(
  supabase: ServiceClient,
  input: {
    userId: string
    emailMessageId: string
    eventType: ResendTrackedEmailEvent
    emailId: string
    subject: string
    senderEmail?: string
  },
) {
  const content = notificationContent(
    input.eventType,
    input.emailId,
    input.subject,
    input.senderEmail,
  )
  const { error: saveError } = await supabase.from('notification_events').upsert({
    user_id: input.userId,
    email_message_id: input.emailMessageId,
    event_type: input.eventType,
    ...content,
    data: { path: '/replies', email_message_id: input.emailMessageId },
  }, { onConflict: 'source_key', ignoreDuplicates: true })
  if (saveError) {
    console.error('Could not save an email notification.', saveError.message)
    throw new Error('Could not save the email notification.')
  }

  const { data: notification, error: notificationError } = await supabase
    .from('notification_events')
    .select('id, push_sent_at')
    .eq('source_key', content.source_key)
    .maybeSingle()
  if (notificationError || !notification) {
    console.error('Could not load the saved email notification.', notificationError?.message)
    throw new Error('Could not load the email notification for delivery.')
  }
  if (notification.push_sent_at) return

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', input.userId)
  if (subscriptionError) {
    console.error('Could not load browser notification subscriptions.', subscriptionError.message)
    throw new Error('Could not load browser notification subscriptions.')
  }
  if (!subscriptions?.length) return

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:outreach@arlotech.com.ng'
  if (!publicKey || !privateKey) {
    console.error('Browser push is subscribed but VAPID server keys are missing.')
    throw new Error('Browser push is not configured on the server.')
  }
  webPush.setVapidDetails(subject, publicKey, privateKey)

  const payload = JSON.stringify({
    title: content.title,
    body: content.body,
    url: '/replies',
    tag: content.source_key,
  })
  const deliveries = await Promise.all(subscriptions.map(async (subscription: PushSubscriptionRow) => {
    if (!isTrustedPushEndpoint(subscription.endpoint)) {
      console.error('Removing a browser subscription with an untrusted push service endpoint.')
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', input.userId)
        .eq('endpoint', subscription.endpoint)
      if (deleteError) {
        console.error('Could not remove an untrusted browser subscription.', deleteError.message)
        return false
      }
      return true
    }

    try {
      await webPush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 })
      return true
    } catch (error) {
      const statusCode = error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', input.userId)
          .eq('endpoint', subscription.endpoint)
        if (deleteError) {
          console.error('Could not remove an expired browser subscription.', deleteError.message)
          return false
        }
        return true
      }
      console.error('Could not deliver a browser notification.', error instanceof Error ? error.message : 'Unknown error')
      return false
    }
  }))

  if (!deliveries.some(Boolean)) {
    throw new Error('Could not deliver the browser notification to any subscribed device.')
  }

  const { error: markError } = await supabase
    .from('notification_events')
    .update({ push_sent_at: new Date().toISOString() })
    .eq('id', notification.id)
    .is('push_sent_at', null)
  if (markError) {
    console.error('Could not record browser notification delivery.', markError.message)
    throw new Error('Could not record browser notification delivery.')
  }
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
    const eventType = trackedEmailEventType(event.type)
    if (!eventType) return jsonResponse({ received: true, ignored: true })

    const emailId = event.data?.email_id
    if (typeof emailId !== 'string' || !/^[0-9a-f-]{36}$/i.test(emailId)) {
      return jsonResponse({ error: 'Received email identifier is invalid.' }, 400)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (eventType === 'email.opened') {
      const { data: sentMessage, error: sentMessageError } = await supabase
        .from('email_messages')
        .select('id, user_id, subject, opened_at')
        .eq('provider', 'resend')
        .eq('provider_message_id', emailId)
        .eq('direction', 'outbound')
        .eq('status', 'sent')
        .maybeSingle()
      if (sentMessageError) {
        console.error('Could not find the sent email that was opened.', sentMessageError.message)
        return jsonResponse({ error: 'Could not match the email-open event.' }, 500)
      }
      if (!sentMessage) {
        console.info('Ignoring email-open event because no sent email matched its Resend ID.')
        return jsonResponse({ received: true, ignored: true, reason: 'no_matching_outreach' })
      }

      let firstOpen = false
      if (!sentMessage.opened_at) {
        const openedAt = event.data?.created_at ?? event.created_at ?? new Date().toISOString()
        const { data: updatedMessage, error: updateError } = await supabase
          .from('email_messages')
          .update({ opened_at: openedAt })
          .eq('id', sentMessage.id)
          .is('opened_at', null)
          .select('id')
          .maybeSingle()
        if (updateError) {
          console.error('Could not record the email-open event.', updateError.message)
          return jsonResponse({ error: 'Could not record the email-open event.' }, 500)
        }
        firstOpen = !!updatedMessage
      }

      await notifyUser(supabase, {
        userId: sentMessage.user_id,
        emailMessageId: sentMessage.id,
        eventType,
        emailId,
        subject: sentMessage.subject,
      })
      return jsonResponse({ received: true, duplicate: !firstOpen })
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

    const { data: sentMessage, error: matchError } = await supabase
      .from('email_messages')
      .select('id, user_id, prospect_id, thread_id')
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
      thread_id: sentMessage.thread_id ?? sentMessage.id,
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

    await notifyUser(supabase, {
      userId: sentMessage.user_id,
      emailMessageId: sentMessage.id,
      eventType,
      emailId,
      subject: receivedEmail.subject ?? event.data?.subject ?? '',
      senderEmail,
    })

    return jsonResponse({ received: true, duplicate: insertError?.code === '23505' })
  } catch (error) {
    console.error('Resend inbound webhook processing failed.', error instanceof Error ? error.message : 'Unknown error')
    return jsonResponse({ error: 'Webhook processing failed.' }, 500)
  }
})
