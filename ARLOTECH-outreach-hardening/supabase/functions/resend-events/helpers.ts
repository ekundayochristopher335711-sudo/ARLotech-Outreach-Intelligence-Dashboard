import { normalizedEmail } from '../resend-inbound/helpers.ts'

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/
const EMAIL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const EMAIL_EVENT_STATUSES = {
  'email.sent': 'accepted',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
} as const

type EmailEventType = keyof typeof EMAIL_EVENT_STATUSES
type SuppressionEventType = 'suppression.added' | 'suppression.removed'
const SUPPORTED_EVENT_TYPES = new Set<string>([
  ...Object.keys(EMAIL_EVENT_STATUSES),
  'suppression.added',
  'suppression.removed',
])

export interface ParsedResendEvent {
  eventType: EmailEventType | SuppressionEventType
  eventStatus: typeof EMAIL_EVENT_STATUSES[EmailEventType] | null
  providerMessageId: string | null
  recipientEmails: string[]
  occurredAt: string
  suppressionOrigin: 'bounce' | 'complaint' | 'manual' | null
  reason: string | null
}

function decodeBase64(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

export async function verifyResendWebhookSignature(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  secret: string,
  now = Date.now(),
) {
  const { id, timestamp, signature } = headers
  if (!id || !EVENT_ID_PATTERN.test(id) || !timestamp || !/^\d{1,12}$/.test(timestamp) || !signature) return false
  if (!secret.startsWith('whsec_')) return false

  const timestampSeconds = Number(timestamp)
  if (Math.abs(now / 1000 - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) return false

  try {
    const signingKey = await crypto.subtle.importKey(
      'raw',
      decodeBase64(secret.slice('whsec_'.length)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const payload = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, payload))

    return signature.split(' ').some((part) => {
      const [version, encoded] = part.split(',', 2)
      if (version !== 'v1' || !encoded) return false
      try {
        return equalBytes(expected, decodeBase64(encoded))
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validDate(value: unknown) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function reasonText(value: unknown) {
  if (typeof value !== 'string') return null
  const reason = value.trim().slice(0, 500)
  return reason || null
}

export function parseResendProviderEvent(payload: unknown): ParsedResendEvent | null {
  if (!isRecord(payload) || !isRecord(payload.data) || typeof payload.type !== 'string') return null
  const data = payload.data
  const occurredAt = validDate(data.created_at) || validDate(payload.created_at)
  if (!occurredAt) return null

  if (payload.type in EMAIL_EVENT_STATUSES) {
    const eventType = payload.type as EmailEventType
    const providerMessageId = data.email_id
    if (typeof providerMessageId !== 'string' || !EMAIL_ID_PATTERN.test(providerMessageId)) return null
    if (!Array.isArray(data.to)) return null
    const recipientEmails = [...new Set(data.to.map(normalizedEmail).filter((email): email is string => !!email))]
    if (recipientEmails.length === 0) return null

    const detail = eventType === 'email.bounced' && isRecord(data.bounce)
      ? data.bounce.message
      : eventType === 'email.failed' && isRecord(data.failed)
        ? data.failed.reason
        : eventType === 'email.suppressed' && isRecord(data.suppressed)
          ? data.suppressed.type
          : null

    return {
      eventType,
      eventStatus: EMAIL_EVENT_STATUSES[eventType],
      providerMessageId,
      recipientEmails,
      occurredAt,
      suppressionOrigin: eventType === 'email.bounced' ? 'bounce' : eventType === 'email.complained' ? 'complaint' : null,
      reason: reasonText(detail),
    }
  }

  if (payload.type === 'suppression.added' || payload.type === 'suppression.removed') {
    const email = normalizedEmail(data.email)
    const origin = data.origin
    const sourceId = data.source_id
    if (!email || (origin !== 'bounce' && origin !== 'complaint' && origin !== 'manual')) return null
    if (sourceId !== null && sourceId !== undefined && (typeof sourceId !== 'string' || !EMAIL_ID_PATTERN.test(sourceId))) return null
    return {
      eventType: payload.type as SuppressionEventType,
      eventStatus: null,
      providerMessageId: typeof sourceId === 'string' ? sourceId : null,
      recipientEmails: [email],
      occurredAt,
      suppressionOrigin: origin,
      reason: null,
    }
  }

  return null
}

export function isSupportedResendEventType(value: unknown): value is EmailEventType | SuppressionEventType {
  return typeof value === 'string' && SUPPORTED_EVENT_TYPES.has(value)
}