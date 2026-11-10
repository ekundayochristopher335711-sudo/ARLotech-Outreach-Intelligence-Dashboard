interface WebsiteFinding {
  id?: string
  audit_id?: string
  title?: string
  classification?: string
  source?: string
  verified?: boolean
  evidence?: string | null
  display_value?: string | null
  assessment_rating?: string | null
}

interface WebsiteAnalysis {
  findings?: unknown
  analysis_details?: {
    optimization_opportunities?: unknown
  } | null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function resolveReplyToAddress(configuredAddress: string | null, fromAddress: string) {
  const configuredMailbox = configuredAddress?.trim()
  const senderMailbox = fromAddress.match(/<\s*([^<>]+)\s*>/)?.[1]?.trim() || fromAddress.trim()
  const replyTo = configuredMailbox || senderMailbox
  return EMAIL_PATTERN.test(replyTo) ? replyTo : null
}

export function formatSenderAddress(senderName: string, fromAddress: string) {
  const mailbox = fromAddress.match(/<\s*([^<>]+)\s*>/)?.[1]?.trim() || fromAddress.trim()
  if (!EMAIL_PATTERN.test(mailbox)) throw new Error('The configured sender email address is invalid.')
  if (!senderName) return fromAddress
  const quotedName = senderName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${quotedName}" <${mailbox}>`
}

function hasUsefulEvidence(finding: WebsiteFinding) {
  if (!finding.title?.trim() || !finding.evidence?.trim()) return false
  if (finding.assessment_rating === 'Good') return false

  const identifier = `${finding.audit_id ?? ''} ${finding.id ?? ''} ${finding.title ?? ''}`.toLowerCase()
  const evidence = finding.display_value || finding.evidence || ''
  const numericValue = evidence.match(/([\d,]+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s)\b/i)
  if (!numericValue) return true

  const value = Number(numericValue[1].replace(/,/g, ''))
  const milliseconds = /^(milliseconds?|ms)$/i.test(numericValue[2]) ? value : value * 1000
  if (/largest.contentful.paint|\blcp\b/.test(identifier)) return milliseconds > 2500
  if (/first.contentful.paint|\bfcp\b/.test(identifier)) return milliseconds > 1800
  if (/interaction.to.next.paint|\binp\b|total.blocking.time|\btbt\b/.test(identifier)) return milliseconds > 200
  if (/speed.index/.test(identifier)) return milliseconds > 3400
  return true
}

export function hasActionableWebsiteFinding(analysis: WebsiteAnalysis | null | undefined) {
  if (!analysis) return false

  const findings = Array.isArray(analysis.findings) ? analysis.findings as WebsiteFinding[] : []
  const verifiedFindings = findings.some((finding) => {
    const classification = finding.classification ?? (
      finding.source === 'lighthouse'
        ? 'verified_issue'
        : finding.source === 'html_inspection' || finding.source === 'content'
          ? 'observed_issue'
          : ''
    )
    return (
      ['verified_issue', 'observed_issue'].includes(classification) &&
      finding.verified !== false &&
      hasUsefulEvidence(finding)
    )
  })
  if (verifiedFindings) return true

  const opportunities = analysis.analysis_details?.optimization_opportunities
  return Array.isArray(opportunities) && opportunities.some((finding: WebsiteFinding) =>
    finding?.classification === 'optimization_opportunity' &&
    !!finding.title?.trim() &&
    !!finding.evidence?.trim(),
  )
}
