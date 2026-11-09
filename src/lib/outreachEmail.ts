import type { Prospect, WebsiteAnalysis } from '@/types'
import { normalizeWebsiteDomain } from '@/lib/websiteDomain'
import { auditFindingEmailTopic } from '@/lib/auditReportLanguage'
import {
  containsEmailJargon,
  containsExternalAuditReference,
  emailFindingTitle,
} from '@/lib/emailCopy'
import {
  feedbackRequest,
  industryWebsiteImprovementLine,
  industryImpactLine,
  normalizedDraftIdentity,
  personalizedEmailFindingImpact,
  removeDraftHyphens,
} from '@/lib/emailPersonalization'
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
  positive_observations?: WebsiteAnalysis['positive_observations']
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

function firstName(contactName: string | null | undefined, businessName: string) {
  const fallbackName = businessName.trim()
  return contactName?.trim().split(/\s+/)[0] ||
    (fallbackName && fallbackName !== 'your business' ? `${fallbackName} team` : 'there')
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

function observationText(finding: SelectedOutreachFinding, category?: string | null) {
  return {
    title: emailFindingTitle(finding),
    impact: personalizedEmailFindingImpact(finding, category),
  }
}

export function createOutreachPreview(
  prospect: Pick<Prospect, 'id' | 'business_name' | 'contact_name' | 'website' | 'business_category'>,
  analysis?: OutreachAnalysis | null,
): OutreachPreview {
  if (!prospect.website?.trim()) {
    throw new Error('Add a website link to this prospect before generating an email draft.')
  }
  const name = prospect.business_name.trim() || 'your business'
  const greetingName = firstName(prospect.contact_name, name)
  const category = prospect.business_category?.trim()
  const signOff = 'Kind regards,\nARLOTECH DIGITAL SOLUTIONS\narlotech.com.ng'
  if (!analysis || !hasMatchingWebsiteAnalysis(prospect, analysis)) {
    return {
      prospect_id: prospect.id,
      analysis_id: null,
      subject: removeDraftHyphens(`A quick website observation for ${name}`),
      body: `Hi ${greetingName},\n\n${industryWebsiteImprovementLine()}\n\nWould a short conversation be useful?\n\n${signOff}`,
      has_website_report: false,
      suitability: 'Incomplete Audit',
      internal_note: 'No matching website review is available; this general draft is not based on site-specific findings.',
    }
  }

  const suitability = getOutreachSuitability(analysis)
  if (suitability === 'Incomplete Audit') {
    throw new Error('This audit is incomplete and does not provide enough verified evidence for outreach.')
  }
  if (suitability === 'No Opportunity') {
    throw new Error('No meaningful website improvement opportunity was verified. Outreach was withheld.')
  }

  const selectedFinding = selectOutreachFinding(analysis)
  if (!selectedFinding) throw new Error('No evidence-backed website finding is available for outreach.')

  const { title, impact } = observationText(selectedFinding, category)
  const internalNote = `We chose "${title}" because it is the clearest item supported by this website check.`
  const body = [
    `Hi ${greetingName},`,
    '',
    `A review of ${name}'s website highlighted one area that may be worth a closer look.`,
    `The review highlighted that ${title.charAt(0).toLowerCase()}${title.slice(1)}. ${impact}`,
    feedbackRequest(),
    ...(category &&
      !/additional website features may affect responsiveness|important images/i.test(title)
      ? [industryImpactLine(category, title)]
      : []),
    '',
    industryWebsiteImprovementLine(),
    '',
    'The attached PDF contains the website review and practical recommendations.',
    '',
    signOff,
  ].join('\n')

  return {
    prospect_id: prospect.id,
    analysis_id: analysis.id,
    subject: removeDraftHyphens(`A website idea for ${name}: ${auditFindingEmailTopic(selectedFinding)}`),
    body: removeDraftHyphens(body),
    has_website_report: true,
    suitability,
    selected_finding: selectedFinding,
    internal_note: internalNote,
  }
}

export function validateOutreachPreview(
  preview: OutreachPreview,
  prospect: Pick<Prospect, 'business_name' | 'website' | 'business_category'>,
  analysis?: OutreachAnalysis | null,
) {
  if (!preview.subject.trim() || !preview.body.trim()) throw new Error('Every message needs a subject and body.')
  if (!prospect.website?.trim()) {
    throw new Error('Add a website link to this prospect before generating an email draft.')
  }
  if (preview.has_website_report && !prospect.website) {
    throw new Error('The email report attachment setting does not match the prospect website.')
  }
  if (
    !normalizedDraftIdentity(preview.subject).includes(normalizedDraftIdentity(prospect.business_name)) ||
    !normalizedDraftIdentity(preview.body).includes(normalizedDraftIdentity(prospect.business_name)) ||
    containsEmailJargon(`${preview.subject}\n${preview.body}`) ||
    (preview.body.match(/\?/g) ?? []).length !== 1
  ) {
    throw new Error('The email is missing the correct business name or single conversational question, or contains technical language.')
  }
  if (!analysis || !hasMatchingWebsiteAnalysis(prospect, analysis)) {
    if (preview.has_website_report || /we’ve attached a concise pdf|attachment/i.test(preview.body)) {
      throw new Error('A matching website audit is required before attaching a report.')
    }
    return
  }
  if (preview.analysis_id !== analysis.id || !preview.has_website_report) {
    throw new Error('The website audit changed after this preview. Refresh the email preview before sending.')
  }

  const currentPreview = createOutreachPreview({
    id: preview.prospect_id,
    business_name: prospect.business_name,
    contact_name: '',
    website: prospect.website,
    business_category: prospect.business_category,
  }, analysis)
  if (currentPreview.selected_finding?.id !== preview.selected_finding?.id) {
    throw new Error('The selected audit finding changed. Refresh the email preview before sending.')
  }
  const finding = currentPreview.selected_finding!
  const { title, impact } = observationText(finding, prospect.business_category)
  if (
    !normalizedDraftIdentity(preview.subject).includes(normalizedDraftIdentity(prospect.business_name)) ||
    /\b(I|me|my)\b/i.test(preview.body) ||
    !preview.body.includes('Arlotech Digital Solutions') ||
    !/designs and builds new websites, and improves existing ones with focused updates/i.test(preview.body) ||
    !/the attached pdf contains the website review and practical recommendations/i.test(preview.body) ||
    containsEmailJargon(`${preview.subject}\n${preview.body}`) ||
    !normalizedDraftIdentity(preview.subject).includes(normalizedDraftIdentity(auditFindingEmailTopic(finding))) ||
    !normalizedDraftIdentity(preview.body).includes(normalizedDraftIdentity(title)) ||
    !normalizedDraftIdentity(preview.body).includes(normalizedDraftIdentity(impact)) ||
    /website review snapshot|finding:|why it matters:/i.test(preview.body) ||
    preview.body.indexOf('Would you be open to discussing what might work best for your website?') >
      preview.body.indexOf('The attached PDF') ||
    containsExternalAuditReference(`${preview.subject}\n${preview.body}`) ||
    !/would you be open to discussing what might work best for your website\?/i.test(preview.body) ||
    !/\b(?:are|is|do|does|would|could)\b[^?]*\?/i.test(preview.body)
  ) {
    throw new Error('The edited email no longer matches the audit evidence or ArloTech company voice.')
  }
}
