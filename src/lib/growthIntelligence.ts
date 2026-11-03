export type ProspectSignals = {
  business_name: string
  email?: string | null
  website?: string | null
  business_category?: string | null
  status: string
  do_not_contact?: boolean | null
  created_at?: string | null
}

export type AuditSignals = {
  overall_score?: number | null
  performance_score?: number | null
  seo_score?: number | null
  accessibility_score?: number | null
  best_practices_score?: number | null
}

const SUPPRESSED = new Set(['do not contact', 'not interested', 'won', 'lost', 'unsubscribed', 'opted out'])

/** Opportunity priority, not a prediction that a prospect will buy. */
export function scoreProspectOpportunity(prospect: ProspectSignals, audit?: AuditSignals) {
  if (prospect.do_not_contact || SUPPRESSED.has(prospect.status.trim().toLowerCase())) {
    return { score: 0, eligible: false, factors: ['Suppressed from outreach'], recommendation: 'Do not contact' }
  }
  let score = 25
  const factors: string[] = []
  if (!prospect.website?.trim()) { score += 30; factors.push('No website recorded: potential website project') }
  else if (audit?.overall_score != null) {
    const health = Math.max(0, Math.min(100, audit.overall_score))
    const points = Math.round(Math.max(0, 75 - health) * 0.45)
    score += points
    if (points) factors.push(`Website health ${health}/100: ${points} opportunity points`)
  } else { score += 7; factors.push('Website recorded; audit not available') }
  if (audit) {
    const categories = [audit.performance_score, audit.seo_score, audit.accessibility_score, audit.best_practices_score].filter((v): v is number => typeof v === 'number')
    const weak = categories.filter(v => v < 60).length
    score += Math.min(12, weak * 3)
    if (weak) factors.push(`${weak} measured audit categories below 60`)
  }
  if (prospect.email?.trim()) { score += 8; factors.push('Email address recorded') }
  if (prospect.business_category?.trim()) { score += 5; factors.push('Business category recorded') }
  const status = prospect.status.toLowerCase()
  if (['interested', 'meeting booked', 'replied'].includes(status)) { score += 20; factors.push('Existing engagement recorded') }
  else if (['new', 'ready for outreach'].includes(status)) { score += 5; factors.push('Available for initial outreach') }
  score = Math.max(0, Math.min(100, score))
  const recommendation = !prospect.email ? 'Find a verified contact address' : !prospect.website ? 'Offer a website discovery conversation' : !audit ? 'Run a website audit before pitching' : (audit.overall_score ?? 100) < 60 ? 'Prioritize a focused improvement proposal' : status === 'interested' || status === 'replied' ? 'Respond personally and advance the conversation' : 'Review evidence and send a relevant introduction'
  return { score, eligible: true, factors, recommendation }
}

export type ConversationSignals = { status: string; do_not_contact?: boolean; latestInbound?: string | null; latestOutboundAt?: string | null; bounced?: boolean; complained?: boolean }
export function recommendNextOutreachAction(signals: ConversationSignals) {
  const status = signals.status.toLowerCase()
  if (signals.do_not_contact || ['do not contact', 'unsubscribed', 'opted out', 'not interested', 'won', 'lost'].includes(status)) return { action: 'Stop outreach', reason: 'Suppression or terminal CRM status', safeToDraft: false }
  if (signals.complained || signals.bounced) return { action: 'Pause and investigate', reason: signals.complained ? 'Complaint recorded' : 'Bounce recorded; verify address and provider event', safeToDraft: false }
  if (status === 'meeting booked') return { action: 'Prepare for the meeting', reason: 'Do not send another automated sales follow-up', safeToDraft: false }
  if (signals.latestInbound) {
    const text = signals.latestInbound.toLowerCase()
    if (/\b(stop|unsubscribe|remove me|do not contact)\b/.test(text)) return { action: 'Stop outreach', reason: 'Inbound message appears to request suppression; confirm and record opt-out', safeToDraft: false }
    if (/\b(price|pricing|cost|quote|how much)\b/.test(text)) return { action: 'Prepare a pricing response', reason: 'Prospect asked about pricing', safeToDraft: true }
    if (/\b(interested|sounds good|tell me more|more information|details)\b/.test(text)) return { action: 'Prepare a personal response', reason: 'Positive or information-seeking reply detected; review context', safeToDraft: true }
    return { action: 'Review and reply personally', reason: 'A reply exists; do not send a generic follow-up', safeToDraft: true }
  }
  if (!signals.latestOutboundAt) return { action: 'Prepare first outreach', reason: 'No outbound message timestamp is recorded', safeToDraft: true }
  const ageDays = (Date.now() - new Date(signals.latestOutboundAt).getTime()) / 86400000
  if (ageDays < 3) return { action: 'Wait', reason: 'Recent outreach; avoid premature follow-up', safeToDraft: false }
  if (ageDays < 8) return { action: 'Consider a gentle follow-up', reason: 'No reply recorded after several days', safeToDraft: true }
  return { action: 'Review before another follow-up', reason: 'Older outreach; check prior attempts and relevance', safeToDraft: true }
}

export function assessEmailQuality(input: { subject: string; body: string; businessName?: string; recipient?: string; doNotContact?: boolean; duplicateRecently?: boolean }) {
  const subject = input.subject.trim(), body = input.body.trim(), lower = body.toLowerCase()
  const checks = [
    { label: 'Recipient available', pass: Boolean(input.recipient?.trim()), severity: 'error' as const },
    { label: 'Subject is concise', pass: subject.length > 0 && subject.length <= 80, severity: 'warning' as const },
    { label: 'Business-specific reference', pass: Boolean(input.businessName && lower.includes(input.businessName.toLowerCase())), severity: 'warning' as const },
    { label: 'Clear next-step question', pass: /\?/.test(body), severity: 'warning' as const },
    { label: 'Appropriate length', pass: body.split(/\s+/).filter(Boolean).length >= 55 && body.split(/\s+/).filter(Boolean).length <= 220, severity: 'warning' as const },
    { label: 'No unsupported guarantee', pass: !/guarantee|will (double|triple)|guaranteed results/i.test(body), severity: 'error' as const },
    { label: 'No false attachment claim', pass: !/attached (is|are)|please see attached/i.test(body), severity: 'error' as const },
    { label: 'No recent duplicate', pass: !input.duplicateRecently, severity: 'error' as const },
    { label: 'Recipient not suppressed', pass: !input.doNotContact, severity: 'error' as const },
  ]
  const errors = checks.filter(c => !c.pass && c.severity === 'error').map(c => c.label)
  const warnings = checks.filter(c => !c.pass && c.severity === 'warning').map(c => c.label)
  const score = Math.round(checks.filter(c => c.pass).length / checks.length * 100)
  return { score, checks, errors, warnings, readyForReview: errors.length === 0 }
}
