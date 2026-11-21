export interface EmailMetricMessage {
  direction: string
  status?: string | null
  thread_id?: string | null
  prospect_id?: string | null
  recipient_email?: string | null
  sender_email?: string | null
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function messageIdentity(message: EmailMetricMessage, direction: 'outbound' | 'inbound') {
  if (message.thread_id) return `thread:${message.thread_id}`
  if (message.prospect_id) return `prospect:${message.prospect_id}`
  const email = normalizeEmail(direction === 'outbound' ? message.recipient_email : message.sender_email)
  return email ? `email:${email}` : null
}

export function calculateReplyRate(messages: EmailMetricMessage[]) {
  const outboundIdentities = new Set<string>()
  const inboundIdentities = new Set<string>()

  for (const message of messages) {
    if (message.direction === 'outbound' && message.status === 'sent') {
      const identity = messageIdentity(message, 'outbound')
      if (identity) outboundIdentities.add(identity)
    }
    if (message.direction === 'inbound') {
      const identity = messageIdentity(message, 'inbound')
      if (identity) inboundIdentities.add(identity)
    }
  }

  const repliedTargets = [...inboundIdentities].filter((identity) => outboundIdentities.has(identity)).length
  return outboundIdentities.size ? Math.round((repliedTargets / outboundIdentities.size) * 100) : 0
}
