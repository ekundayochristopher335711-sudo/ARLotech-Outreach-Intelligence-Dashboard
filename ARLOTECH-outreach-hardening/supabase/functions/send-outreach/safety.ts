const TERMINAL_PROSPECT_STATUSES = new Set([
  'do not contact',
  'not interested',
  'won',
  'lost',
  'unsubscribed',
  'opted out',
  'complained',
  'hard bounced',
])

export function isTerminalProspectStatus(status: unknown) {
  return typeof status === 'string' && TERMINAL_PROSPECT_STATUSES.has(status.trim().toLowerCase().replace(/[_-]+/g, ' '))
}

export function isCampaignSendableStatus(status: unknown) {
  return typeof status === 'string' && status.trim().toLowerCase() === 'active'
}

export function duplicateRecipients(recipients: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const recipient of recipients) {
    const normalized = recipient?.trim().toLowerCase()
    if (!normalized) continue
    if (seen.has(normalized)) duplicates.add(normalized)
    seen.add(normalized)
  }
  return [...duplicates]
}