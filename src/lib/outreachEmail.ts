import type { Prospect, WebsiteAnalysis } from '@/types'
import { normalizeWebsiteDomain } from '@/lib/websiteDomain'
import {
  auditFindingEmailTopic,
  auditFindingTitle,
  auditFindingWhy,
  auditFindingRecommendation,
} from '@/lib/auditReportLanguage'
import { rateLighthouseFinding } from '@/lib/websiteAudit'

type AuditFinding = {
  id?: string
  audit_id?: string
  title?: string
  classification?: string
  source?: string
  verified?: boolean
  evidence?: string | null
  display_value?: string | null
  assessment_rating?: string | null
  explanation?: string | null
  recommended_fix?: string | null
  priority?: string | null
  severity?: string | null
  confidence?: string | number | null
  opportunity_ms?: number | null
  opportunity_bytes?: number | null
  affected_resources?: string[] | null
}

type OutreachAnalysis = Pick<WebsiteAnalysis, 'id' | 'website_url' | 'findings' | 'overall_score'> & {
  category_scores?: Record<string, number | null> | null
  ai_analysis?: Record<string, unknown> | null
}

export type OutreachSuitability =
  | 'Excellent Opportunity'
  | 'Good Opportunity'
  | 'Low Opportunity'
  | 'No Opportunity'
  | 'Incomplete Audit'

export interface SelectedOutreachFinding extends AuditFinding {
  classification: 'verified_issue' | 'optimization_opportunity' | 'observed_issue'
  source: string
}

export interface OutreachPreview {
  prospect_id: string
  analysis_id: string | null
  subject: string
  body: string
  has_website_report: boolean
  suitability: OutreachSuitability
  selected_finding?: SelectedOutreachFinding
  internal_note: string
}

const MEANINGFUL_SAVINGS_MS = 50
const MEANINGFUL_SAVINGS_BYTES = 20 * 1024

function firstName(contactName: string | null | undefined) {
  return contactName?.trim().split(/\s+/)[0] || 'there'
}

export function hasMatchingWebsiteAnalysis(
  prospect: Pick<Prospect, 'website'>,
  analysis?: Pick<WebsiteAnalysis, 'website_url'> | null,
) {
  if (!prospect.website || !analysis?.website_url) return false
  try {
    return normalizeWebsiteDomain(prospect.website) === normalizeWebsiteDomain(analysis.website_url)
  } catch {
    return false
  }
}

function auditCompleteness(analysis: OutreachAnalysis) {
  const completeness = analysis.ai_analysis?.audit_completeness
  return completeness && typeof completeness === 'object'
    ? completeness as { status?: string; missing_categories?: string[] }
    : null
}

function candidateFindings(analysis: OutreachAnalysis): SelectedOutreachFinding[] {
  const verifiedOrObserved = ((Array.isArray(analysis.findings) ? analysis.findings : []) as AuditFinding[])
    .flatMap((finding) => {
      const findingRating = rateLighthouseFinding(finding)
      const classification = finding.classification ??
        (finding.source === 'lighthouse' && finding.verified !== false
          ? 'verified_issue'
          : finding.source === 'html_inspection' || finding.source === 'content'
            ? 'observed_issue'
            : '')
      if (
        !['verified_issue', 'observed_issue'].includes(classification) ||
        finding.verified === false ||
        finding.assessment_rating === 'Good' ||
        findingRating === 'Good' ||
        !finding.title?.trim() ||
        !finding.evidence?.trim() ||
        isClearlyPositiveMetric(finding)
      ) return []
      return [{
        ...finding,
        source: finding.source || (classification === 'verified_issue' ? 'lighthouse' : 'html_inspection'),
        classification: classification as SelectedOutreachFinding['classification'],
      }]
    })
  const opportunities = Array.isArray(analysis.ai_analysis?.optimization_opportunities)
    ? analysis.ai_analysis.optimization_opportunities as AuditFinding[]
    : []
  const validOpportunities = opportunities.flatMap((finding) => {
    if (
      finding.classification !== 'optimization_opportunity' ||
      !finding.title?.trim() ||
      !finding.evidence?.trim()
    ) return []
    return [{ ...finding, source: finding.source || 'lighthouse', classification: 'optimization_opportunity' as const }]
  })

  return [...verifiedOrObserved, ...validOpportunities]
}

function isClearlyPositiveMetric(finding: AuditFinding) {
  const title = `${finding.title ?? ''} ${finding.id ?? ''}`.toLowerCase()
  const evidence = (finding.evidence ?? '').toLowerCase()
  const numericValue = evidence.match(/(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s)\b/)
  if (!numericValue) return false
  const value = Number(numericValue[1])
  const milliseconds = /^(milliseconds?|ms)$/.test(numericValue[2])
    ? value
    : value * 1000

  if (/largest contentful paint|\blcp\b/.test(title)) return milliseconds <= 2500
  if (/first contentful paint|\bfcp\b/.test(title)) return milliseconds <= 1800
  if (/interaction to next paint|\binp\b/.test(title)) return milliseconds <= 200
  if (/total blocking time|\btbt\b/.test(title)) return milliseconds <= 200
  return false
}

function priorityRank(finding: SelectedOutreachFinding) {
  const severity = (finding.severity || finding.priority || '').toLowerCase()
  if (severity.includes('critical')) return 6
  if (severity === 'high') return 5
  if (severity === 'medium') return 4
  if (finding.classification === 'optimization_opportunity') {
    if ((finding.opportunity_ms ?? 0) >= MEANINGFUL_SAVINGS_MS ||
      (finding.opportunity_bytes ?? 0) >= MEANINGFUL_SAVINGS_BYTES) return 3
    return 1
  }
  return severity === 'low' ? 2 : 1
}

export function selectOutreachFinding(analysis: OutreachAnalysis) {
  return candidateFindings(analysis)
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => {
      const priorityDifference = priorityRank(right.finding) - priorityRank(left.finding)
      if (priorityDifference) return priorityDifference
      const savingsDifference =
        (right.finding.opportunity_ms ?? 0) - (left.finding.opportunity_ms ?? 0) ||
        (right.finding.opportunity_bytes ?? 0) - (left.finding.opportunity_bytes ?? 0)
      if (savingsDifference) return savingsDifference
      const confidence = (value: SelectedOutreachFinding) =>
        typeof value.confidence === 'number'
          ? value.confidence
          : value.confidence === 'high' ? 3 : value.confidence === 'medium' ? 2 : 1
      return confidence(right.finding) - confidence(left.finding) || left.index - right.index
    })[0]?.finding ?? null
}

export function getOutreachSuitability(analysis: OutreachAnalysis): OutreachSuitability {
  const finding = selectOutreachFinding(analysis)
  const completeness = auditCompleteness(analysis)
  const scores = analysis.category_scores
  const hasCompleteCategoryData = scores &&
    ['performance', 'seo', 'accessibility', 'best-practices'].every((category) => {
      const score = scores[category]
      return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100
    })

  if (!finding) {
    if (completeness?.status === 'failed' || !hasCompleteCategoryData) return 'Incomplete Audit'
    return 'No Opportunity'
  }

  const rank = priorityRank(finding)
  if (rank >= 5) return 'Excellent Opportunity'
  if (rank >= 3) return 'Good Opportunity'
  return 'Low Opportunity'
}

function plainLanguageSavingsText(finding: SelectedOutreachFinding) {
  const savings: string[] = []
  if (typeof finding.opportunity_bytes === 'number' && finding.opportunity_bytes > 0) {
    const kibibytes = Math.round(finding.opportunity_bytes / 1024)
    const kilobytes = Math.round(finding.opportunity_bytes / 1000)
    savings.push(`${kibibytes} KiB (about ${kilobytes} KB) less to download`)
  }
  if (typeof finding.opportunity_ms === 'number' && finding.opportunity_ms > 0) {
    const seconds = (finding.opportunity_ms / 1000).toFixed(2)
    savings.push(`${Math.round(finding.opportunity_ms)} ms (${seconds} seconds) in Google's test`)
  }
  return savings
}

function observationText(finding: SelectedOutreachFinding) {
  const title = auditFindingTitle(finding)
  const evidence = finding.evidence!.trim()
  if (finding.classification === 'optimization_opportunity') {
    const savings = plainLanguageSavingsText(finding)
    const estimate = savings.length ? ` (${savings.join(' and ')})` : ''
    return {
      observation: `${title.toLowerCase()}. Google PageSpeed estimates a possible improvement${estimate}. This is not a confirmed problem.`,
      recommendation: auditFindingRecommendation(finding),
    }
  }
  return {
    observation: `${title.toLowerCase()}. Our website check recorded: ${evidence.slice(0, 200)}`,
    recommendation: auditFindingRecommendation(finding),
  }
}

export function createOutreachPreview(
  prospect: Pick<Prospect, 'id' | 'business_name' | 'contact_name' | 'website' | 'business_category'>,
  analysis?: OutreachAnalysis | null,
): OutreachPreview {
  const name = prospect.business_name.trim() || 'your business'
  const greetingName = firstName(prospect.contact_name)
  const signOff = 'Kind regards,\nArlotech Digital Solutions'

  if (!prospect.website) {
    const category = prospect.business_category?.trim()
    return {
      prospect_id: prospect.id,
      analysis_id: null,
      subject: `A website idea for ${name}`,
      body: [
        `Hi ${greetingName},`,
        '',
        `We came across ${name}${category ? ` while researching local ${category.toLowerCase()} businesses` : ''}. We did not find a website linked to the business information available to us, so we wanted to ask whether you are considering a simple site to help prospective customers learn about your services and get in touch.`,
        '',
        'Our team at Arlotech Digital Solutions works on websites and online services. If a website is something you are exploring, we would be glad to share a few practical ideas. If it is not relevant, let us know and we will not follow up.',
        '',
        'Would it be helpful if we shared a few ideas?',
        '',
        signOff,
      ].join('\n'),
      has_website_report: false,
      suitability: 'Low Opportunity',
      internal_note: 'No website was provided, so this is a general introduction and is not based on a website audit.',
    }
  }

  if (!hasMatchingWebsiteAnalysis(prospect, analysis)) {
    throw new Error('A completed audit for this exact website is required before preparing the email.')
  }
  if (!analysis) throw new Error('A completed website audit is required before preparing the email.')

  const suitability = getOutreachSuitability(analysis)
  if (suitability === 'Incomplete Audit') {
    throw new Error('This audit is incomplete and does not provide enough verified evidence for outreach.')
  }
  if (suitability === 'No Opportunity') {
    throw new Error('No meaningful website improvement opportunity was verified. Outreach was withheld.')
  }

  const selectedFinding = selectOutreachFinding(analysis)
  if (!selectedFinding) throw new Error('No evidence-backed website finding is available for outreach.')

  const { observation, recommendation } = observationText(selectedFinding)
  const internalNote = `We chose "${auditFindingTitle(selectedFinding)}" because it is the clearest item supported by this website check.`
  const body = [
    `Hi ${greetingName},`,
    '',
    `We reviewed ${name}'s website and noticed ${observation}.`,
    auditFindingWhy(selectedFinding),
    recommendation,
    '',
    'We attached a short review with the evidence and next steps. It separates measured results from ideas to check.',
    '',
    'Would you be open to a brief conversation about this?',
    '',
    'If this is not relevant, please let us know and we will not follow up.',
    '',
    signOff,
  ].join('\n')

  return {
    prospect_id: prospect.id,
    analysis_id: analysis.id,
    subject: `A website idea for ${name}: ${auditFindingEmailTopic(selectedFinding)}`,
    body,
    has_website_report: true,
    suitability,
    selected_finding: selectedFinding,
    internal_note: internalNote,
  }
}

export function validateOutreachPreview(
  preview: OutreachPreview,
  prospect: Pick<Prospect, 'business_name' | 'website'>,
  analysis?: OutreachAnalysis | null,
) {
  if (!preview.subject.trim() || !preview.body.trim()) throw new Error('Every message needs a subject and body.')
  if (preview.has_website_report !== !!prospect.website) {
    throw new Error('The email report attachment setting does not match the prospect website.')
  }
  if (
    !preview.subject.includes(prospect.business_name) ||
    !preview.body.includes(prospect.business_name) ||
    !/will not follow up/i.test(preview.body) ||
    (preview.body.match(/\?/g) ?? []).length !== 1
  ) {
    throw new Error('The email is missing the correct business name, opt-out, or single conversational question.')
  }
  if (!prospect.website) {
    if (
      /\b(I|me|my)\b/i.test(preview.body) ||
      !preview.body.includes('Arlotech Digital Solutions') ||
      /attached|attachment/i.test(preview.body)
    ) {
      throw new Error('Outreach messages must use ArloTech company voice and signature.')
    }
    return
  }
  if (!analysis || preview.analysis_id !== analysis.id || !hasMatchingWebsiteAnalysis(prospect, analysis)) {
    throw new Error('The website audit changed after this preview. Refresh the email preview before sending.')
  }

  const currentPreview = createOutreachPreview({
    id: preview.prospect_id,
    business_name: prospect.business_name,
    contact_name: '',
    website: prospect.website,
    business_category: null,
  }, analysis)
  if (currentPreview.selected_finding?.id !== preview.selected_finding?.id) {
    throw new Error('The selected audit finding changed. Refresh the email preview before sending.')
  }
  const finding = currentPreview.selected_finding!
  if (
    !preview.subject.includes(prospect.business_name) ||
    /\b(I|me|my)\b/i.test(preview.body) ||
    !preview.body.includes('Arlotech Digital Solutions') ||
    !/will not follow up/i.test(preview.body) ||
    !preview.subject.includes(auditFindingEmailTopic(finding)) ||
    !preview.body.toLowerCase().includes(auditFindingTitle(finding).toLowerCase()) ||
    !/\bwould you\b[^?]*\?/i.test(preview.body)
  ) {
    throw new Error('The edited email no longer matches the audit evidence or ArloTech company voice.')
  }
  const requiredEvidence = finding.classification === 'optimization_opportunity'
    ? plainLanguageSavingsText(finding)
    : [finding.evidence!.trim()]
  if (requiredEvidence.some((evidence) => !preview.body.includes(evidence))) {
    throw new Error('The edited email omits or changes evidence from the attached audit report.')
  }
}
