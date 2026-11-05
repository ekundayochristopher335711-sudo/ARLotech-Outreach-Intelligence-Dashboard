const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ResendTrackedEmailEvent = 'email.opened' | 'email.received'

export function trackedEmailEventType(value: unknown): ResendTrackedEmailEvent | null {
  return value === 'email.opened' || value === 'email.received' ? value : null
}

export function isTrustedPushEndpoint(value: string) {
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    return false
  }

  const hostname = endpoint.hostname.toLowerCase()
  const trustedHost =
    hostname === 'fcm.googleapis.com' ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname === 'push.services.mozilla.com' ||
    hostname === 'web.push.apple.com' ||
    hostname.endsWith('.notify.windows.com')
  return endpoint.protocol === 'https:' &&
    (!endpoint.port || endpoint.port === '443') &&
    !endpoint.username &&
    !endpoint.password &&
    trustedHost
}

export function notificationContent(
  eventType: ResendTrackedEmailEvent,
  emailId: string,
  subject: string,
  senderEmail = '',
) {
  return eventType === 'email.opened'
    ? {
        source_key: `resend:${eventType}:${emailId}`,
        title: 'Possible email open',
        body: `Resend recorded a possible open for "${subject || 'your email'}". Email privacy tools can trigger opens automatically.`,
      }
    : {
        source_key: `resend:${eventType}:${emailId}`,
        title: 'New reply received',
        body: `${senderEmail || 'A prospect'} replied${subject ? `: ${subject}` : '.'}`,
      }
}

function decodeHtmlCodePoint(value: string, radix: number) {
  const codePoint = Number.parseInt(value, radix)
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : ''
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => decodeHtmlCodePoint(code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => decodeHtmlCodePoint(code, 16))
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizedEmail(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmedValue = value.trim()
  const mailbox = trimmedValue.match(/<\s*([^<>]+?)\s*>/)
  const email = (mailbox?.[1] ?? trimmedValue).trim().toLowerCase()
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null
}
