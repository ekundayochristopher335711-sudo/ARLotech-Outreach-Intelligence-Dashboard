import type { EmailDraft, Prospect, WebsiteAnalysis } from '@/types'
import {
  containsEmailJargon,
  containsExternalAuditReference,
  emailFindingImpact,
  emailFindingTitle,
} from '@/lib/emailCopy'
import {
  feedbackRequest,
  industryImpactLine,
  normalizedDraftIdentity,
  positiveWebsiteAcknowledgement,
  prospectOffering,
  removeDraftHyphens,
} from '@/lib/emailPersonalization'
import { rateLighthouseFinding } from '@/lib/websiteAudit'

export const OUTREACH_STRATEGIES = [
  'general_review',
  'technical_improvement',
  'website_redesign',
  'business_growth',
  'personal_consultancy',
  'cold_outreach',
  'no_website',
  'seo_performance',
  'interested_response',
  'pricing_response',
  'meeting_request',
] as const

export type OutreachStrategy = typeof OUTREACH_STRATEGIES[number]
export type OutreachTone = 'professional' | 'friendly' | 'conversational' | 'consultative' | 'direct' | 'premium'
export type OutreachLength = 'short' | 'standard' | 'detailed'
export type FollowUpStage = 'none' | 'first' | 'second' | 'final'
export type RewriteAction = 'shorten' | 'expand' | 'conversational' | 'professional' | 'improve_cta'

export interface OutreachSignature {
  businessName: string
  senderName: string
  jobTitle: string
  website: string
  email: string
  phone: string
  socialLinks: string
  location: string
}

export const DEFAULT_OUTREACH_SIGNATURE: OutreachSignature = {
  senderName: 'Ekundayo Christopher',
  jobTitle: 'Lead Web Developer',
  businessName: 'Arlotech Digital Solutions',
  website: 'arlotech.com.ng',
  email: 'outreach@arlotech.com.ng',
  phone: '+2348166419332',
  socialLinks: '',
  location: 'Lagos, Nigeria',
}

export interface GeneratedEmailDraft {
  subjectSuggestions: string[]
  body: string
  personalization: string[]
  observationsUsed: string[]
  qualityChecks: string[]
  includesReportReference: boolean
  wordCount: number
}

export interface EmailDraftValidation {
  errors: string[]
  warnings: string[]
}

type DraftProspect = Pick<
  Prospect,
  'business_name' | 'contact_name' | 'website' | 'business_category' | 'city'
>

type DraftFinding = {
  id?: string
  audit_id?: string
  title?: string
  classification?: string
  verified?: boolean
  evidence?: string
  display_value?: string
  assessment_rating?: string
  source?: string
  priority?: string
  severity?: string
  why_it_matters?: string
  recommended_fix?: string
}

type DraftAnalysis = Omit<
  Pick<WebsiteAnalysis, 'website_url' | 'overall_score' | 'category_scores' | 'findings' | 'positive_observations' | 'ai_analysis'>,
  'findings' | 'ai_analysis'
> & {
  findings: DraftFinding[]
  ai_analysis: (Record<string, any> & {
    visual_audit?: {
      observations?: DraftFinding[]
    }
    optimization_opportunities?: DraftFinding[]
  }) | null
}

const industryContexts: Array<[RegExp, string]> = [
  [/plumb|heating|hvac|electric/i, 'helping customers quickly find the right service and request a quote'],
  [/law|legal|solicitor|attorney/i, 'making practice areas and consultation options clear to prospective clients'],
  [/restaurant|food|cafe|hospitality/i, 'making menus, location details, and booking information easy to find'],
  [/construction|builder|contractor/i, 'making services and completed work clear to prospective customers'],
  [/real estate|property|estate agent/i, 'making property information and enquiry options easy to navigate'],
  [/photograph|photo|creative|design/i, 'making work easy for visitors to explore before they enquire or book'],
]

function emailObservationTitle(finding: DraftFinding) {
  return emailFindingTitle(finding)
}

function emailObservationImpact(finding: DraftFinding) {
  return emailFindingImpact(finding)
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || 'there'
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function candidateObservations(analysis?: DraftAnalysis | null) {
  if (!analysis) return []
  const findings = Array.isArray(analysis.findings) ? analysis.findings : []
  const confirmed = findings.filter((finding) =>
    finding &&
    finding.classification !== 'diagnostic' &&
    finding.classification !== 'positive_observation' &&
    finding.verified !== false &&
    rateLighthouseFinding(finding) !== 'Good' &&
    typeof finding.title === 'string' &&
    typeof finding.evidence === 'string' &&
    finding.evidence.trim(),
  ).sort((left, right) => {
    const rank = (finding: DraftFinding) => {
      const priority = (finding.severity || finding.priority || '').toLowerCase()
      return priority === 'critical' ? 5 : priority === 'high' ? 4 : priority === 'medium' ? 3 : priority === 'low' ? 2 : 1
    }
    return rank(right) - rank(left)
  })
  const opportunities = Array.isArray(analysis.ai_analysis?.optimization_opportunities)
    ? analysis.ai_analysis.optimization_opportunities.filter((finding: any) =>
        finding?.classification === 'optimization_opportunity' &&
        typeof finding.title === 'string' &&
        typeof finding.evidence === 'string',
      )
    : []
  const visual = Array.isArray(analysis.ai_analysis?.visual_audit?.observations)
    ? analysis.ai_analysis.visual_audit.observations.filter((finding) =>
        finding && typeof finding.title === 'string' && typeof finding.evidence === 'string',
      ).map((finding) => ({ ...finding, classification: 'observed_visual' }))
    : []
  return [...confirmed, ...opportunities, ...visual].slice(0, 5).map((finding) => ({
    title: emailObservationTitle(finding),
    why: emailObservationImpact(finding),
    estimated: finding.classification === 'optimization_opportunity',
    visual: finding.classification === 'observed_visual',
  }))
}

function signoff(tone: OutreachTone, signature: OutreachSignature) {
  const closing = tone === 'friendly' || tone === 'conversational'
    ? 'Best wishes,'
    : tone === 'direct'
      ? 'Regards,'
      : 'Kind regards,'
  const details = [
    signature.senderName.trim(),
    signature.jobTitle.trim(),
    signature.businessName.trim() || 'Arlotech Digital Solutions',
    signature.website.trim(),
    signature.email.trim(),
    signature.phone.trim(),
    signature.socialLinks.trim(),
    signature.location.trim(),
  ].filter(Boolean)
  return [closing, ...details].join('\n')
}

function subjectOptions(name: string, strategy: OutreachStrategy, topic?: string): string[] {
  const business = name.trim() || 'your website'
  const subjectTopic = topic || 'website review'
  const strategySubject = strategy === 'website_redesign'
    ? 'A few thoughts on your website presentation'
    : strategy === 'business_growth'
      ? 'Making your website easier to use'
      : strategy === 'technical_improvement'
        ? 'A website improvement to consider'
        : strategy === 'personal_consultancy'
          ? 'A quick note about your website'
          : strategy === 'no_website'
            ? `A website idea for ${business}`
            : strategy === 'cold_outreach'
              ? `A quick introduction for ${business}`
              : strategy === 'seo_performance'
                ? `Search visibility and website performance for ${business}`
                : `A website review for ${business}`
  return [...new Set([
    strategySubject,
    `A quick website observation for ${business}`,
    `A few thoughts on ${business}'s website`,
    `${subjectTopic} for ${business}`,
    'A suggestion for your online presence',
  ])].slice(0, 5)
}

export function generateProfessionalEmailDraft(input: {
  prospect: DraftProspect
  analysis?: DraftAnalysis | null
  strategy?: OutreachStrategy
  tone?: OutreachTone
  length?: OutreachLength
  includeReport?: boolean
  signature?: Partial<OutreachSignature>
  followUpStage?: FollowUpStage
  originalSubject?: string
  senderContext?: string
}) : GeneratedEmailDraft {
  const {
    prospect,
    analysis,
    strategy = 'general_review',
    tone = 'professional',
    length = 'standard',
    includeReport = false,
    followUpStage = 'none',
  } = input
  const name = prospect.business_name.trim() || 'your business'
  const greetingName = firstName(prospect.contact_name)
  const signature: OutreachSignature = {
    ...DEFAULT_OUTREACH_SIGNATURE,
    ...input.signature,
  }
  const observations = candidateObservations(analysis)
  const industry = prospect.business_category?.trim() || ''
  const industryContext = industryContexts.find(([pattern]) => pattern.test(industry))?.[1]
  const offering = prospectOffering(industry)
  const positiveObservation = Array.isArray(analysis?.positive_observations)
    ? analysis.positive_observations.find((observation) =>
        typeof observation?.title === 'string' &&
        typeof observation.evidence === 'string' &&
        observation.evidence.trim(),
      )?.title
    : undefined

  const lines = [`Hi ${greetingName},`, '']
  const topic = observations[0]?.title || 'website experience'
  const senderContext = input.senderContext?.trim()
  const contextualReply = strategy === 'interested_response' || strategy === 'pricing_response' || strategy === 'meeting_request'
  if (contextualReply && followUpStage === 'none') {
    const contextLine = senderContext ? `\n\n${senderContext}` : ''
    const replyBody = strategy === 'interested_response'
      ? `Hi ${greetingName},\n\nThank you for getting back to us. We appreciate your interest in exploring improvements to ${name}'s online presence.\n\nThe best next step is to understand what you want the website to achieve, what is working well today, and what you would like to improve. From there, we can suggest a sensible scope rather than recommending work you may not need.${contextLine}\n\nWould you be available for a brief conversation this week?\n\nKind regards,\n${signoff(tone, signature).split('\n').slice(1).join('\n')}`
      : strategy === 'pricing_response'
        ? `Hi ${greetingName},\n\nThanks for asking about pricing for ${name}. The cost depends on the scope of work, the pages or features required, and whether this is a new website, a redesign, or improvements to an existing site.\n\nWe would rather confirm what you need first and give you a clear quote than suggest a figure that does not match the project.${contextLine}\n\nIf you share a little about what you have in mind, we can outline the most suitable option and its cost.\n\nKind regards,\n${signoff(tone, signature).split('\n').slice(1).join('\n')}`
        : `Hi ${greetingName},\n\nThanks for considering Arlotech Digital Solutions. It would be useful to arrange a short call to understand your goals for ${name}'s website and agree on the most practical next steps.${contextLine}\n\nWould you be available for a 15-minute conversation? Feel free to suggest a day and time that works for you.\n\nKind regards,\n${signoff(tone, signature).split('\n').slice(1).join('\n')}`
    const replySubject = removeDraftHyphens(strategy === 'pricing_response' ? `Re: Website project pricing for ${name}` : strategy === 'meeting_request' ? `A quick call about ${name}'s website` : `Re: ${name} website enquiry`)
    return {
      subjectSuggestions: [replySubject, `Next steps for ${name}`, `Arlotech Digital Solutions | ${name}`].map(removeDraftHyphens),
      body: removeDraftHyphens(replyBody),
      personalization: [`Business: ${name}`, ...(prospect.website ? [`Website: ${prospect.website}`] : []), ...(industry ? [`Industry: ${industry}`] : [])],
      observationsUsed: [],
      qualityChecks: ['Written as a response type selected by the operator; verify the conversation context before sending.', senderContext ? 'Additional context supplied by the operator.' : 'No price, delivery date, or project scope was invented.'],
      includesReportReference: false,
      wordCount: wordCount(replyBody),
    }
  }
  if (followUpStage !== 'none') {
    const stageOpening = followUpStage === 'first'
      ? `We wanted to check whether ${topic.toLowerCase()} is something you would be open to discussing.`
      : followUpStage === 'second'
        ? `We wanted to briefly follow up about ${topic.toLowerCase()} in case it is useful to your team.`
        : `We will leave it here for now regarding ${topic.toLowerCase()}.`
    lines.push(stageOpening)
  } else if (strategy === 'no_website') {
    lines.push(`We came across ${name}${industry ? ` while looking at ${industry.toLowerCase()} businesses` : ''}. We couldn't find a website associated with your business in the information available to us, so we wanted to reach out in case building one to explain your ${offering} is something you have been considering.`)
  } else if (strategy === 'cold_outreach') {
    lines.push(`We came across ${name}${industry ? ` while researching ${industry.toLowerCase()} businesses` : ''} and wanted to briefly introduce Arlotech Digital Solutions. We build and improve websites to help businesses present their ${offering} clearly online.`)
  } else if (prospect.website && analysis) {
    lines.push(positiveWebsiteAcknowledgement(name, industry, positiveObservation))
  } else {
    lines.push(`We came across ${name}${industry ? ` while looking at ${industry.toLowerCase()} businesses` : ''} and wanted to introduce Arlotech Digital Solutions.`)
  }

  const strategyObservation = ['no_website', 'cold_outreach'].includes(strategy)
    ? undefined
    : observations.find((item) =>
        strategy === 'technical_improvement' || strategy === 'seo_performance'
          ? /appear|load|respond|search|read|text|image/i.test(item.title)
          : strategy === 'business_growth'
            ? /contact|form|navigation|heading|service|booking|link|button/i.test(item.title)
            : true,
      ) || observations[0]
  const selectedObservations = strategyObservation
    ? [strategyObservation, ...(length === 'detailed' ? observations.filter((item) => item !== strategyObservation).slice(0, 1) : [])]
    : []

  if (selectedObservations.length) {
    lines.push(`One area we noticed was ${selectedObservations[0].title.toLowerCase()}. ${selectedObservations[0].why}`)
    if (industry) lines.push(industryImpactLine(industry, selectedObservations[0].title))
    if (selectedObservations.length > 1) lines.push(selectedObservations[1].why)
    lines.push('')
  } else if (analysis && !['no_website', 'cold_outreach'].includes(strategy)) {
    lines.push('The review did not identify a clear issue worth calling out, so we do not want to invent one. If useful, we can discuss your website goals and see whether any small adjustments make sense.', '')
  } else if ((!analysis || !observations.length) && !['no_website', 'cold_outreach'].includes(strategy)) {
    lines.push('We have not reviewed the site in enough detail to comment on a specific issue, so we do not want to guess.', '')
  }

  const valueLine = strategy === 'no_website'
    ? `At Arlotech Digital Solutions, we design, develop and optimise business websites. We can help plan a site that presents your ${offering} clearly and gives interested people a straightforward way to get in touch.`
    : prospect.website && selectedObservations.length
      ? 'Arlotech Digital Solutions designs and improves business websites. A focused change may address this issue without a full redesign.'
      : prospect.website
        ? 'Arlotech Digital Solutions designs and improves business websites. We would be glad to share a couple of ideas based on your goals.'
      : `At Arlotech Digital Solutions, we design, develop and optimise business websites. We can help present your ${offering} clearly online and make it straightforward for interested people to get in touch.`
  lines.push(valueLine)

  if (prospect.website && analysis && selectedObservations.length) {
    if (senderContext) lines.push(senderContext)
  } else if (strategy === 'business_growth' && industryContext) {
    lines.push('Any changes would depend on your goals; we cannot promise a particular increase in enquiries or sales.')
  } else if (strategy === 'personal_consultancy') {
    lines.push('We would be glad to understand your priorities first and suggest only changes that make sense for your business.')
  } else {
    lines.push('We would be happy to talk through the observation and whether any next step makes sense for your business.')
  }
  if (senderContext && !(prospect.website && analysis && selectedObservations.length)) {
    lines.push(`Additional project detail: ${senderContext}`)
  }
  lines.push('')

  if (includeReport && analysis && prospect.website) {
    lines.push('Your website review is attached. The concise PDF outlines the audit findings and our recommendations.', '')
  }

  const cta = followUpStage === 'final'
    ? 'Would it be helpful to reconnect if this becomes a priority later?'
    : strategy === 'no_website'
      ? 'Would you be open to seeing a simple outline of what a website for your business could include?'
      : strategy === 'cold_outreach'
        ? 'Would it be useful if we sent over a couple of ideas for your online presence?'
        : tone === 'direct'
      ? 'Would a short conversation be useful?'
      : tone === 'consultative'
        ? 'Would you be open to a brief conversation about your priorities?'
        : 'Would it be helpful to talk this through?'
  lines.push(
    includeReport && analysis && prospect.website && followUpStage === 'none'
      ? feedbackRequest()
      : cta,
  )
  lines.push('', 'If this is not relevant, let us know and we will not follow up.')
  lines.push('', signoff(tone, signature))

  let body = lines.join('\n')
  if (length === 'short') {
    body = body
      .replace(/Our review found strong results in [^\n]+\n\n/, '')
      .replace(/We help businesses consider practical website improvements[^\n]*\n/, '')
      .replace(/We help businesses plan and deliver practical website improvements[^\n]*\n/, '')
  } else if (length === 'detailed' && selectedObservations.length === 1 && observations.length > 1) {
    const extra = observations.find((item) => item !== selectedObservations[0])
      if (extra) body = body.replace(
        '\n\nAt Arlotech Digital Solutions',
        `\nThe review also highlighted ${extra.title.toLowerCase()}. ${extra.why}\n\nAt Arlotech Digital Solutions`,
      )
  }

  if (tone === 'friendly' || tone === 'conversational') {
    body = body.replace('We would be happy to talk this through.', 'We would be glad to have a quick, informal chat if that suits you.')
  }
  body = removeDraftHyphens(body)

  const suggestions = followUpStage !== 'none' && input.originalSubject
    ? [...new Set([`Re: ${input.originalSubject.replace(/^(Re:\s*)+/i, '')}`, ...subjectOptions(name, strategy, topic)])].slice(0, 5)
    : subjectOptions(name, strategy, topic)
  const formattedSuggestions = suggestions.map(removeDraftHyphens)
  return {
    subjectSuggestions: formattedSuggestions,
    body,
    personalization: [
      `${prospect.business_name ? `Business: ${prospect.business_name}` : 'Business name unavailable'}`,
      ...(prospect.website ? [`Website: ${prospect.website}`] : []),
      ...(industry ? [`Industry: ${industry}`] : []),
      ...(prospect.city ? [`Location: ${prospect.city}`] : []),
      ...(analysis?.overall_score !== null && analysis?.overall_score !== undefined
        ? [`Overall score: ${analysis.overall_score}/100`]
        : []),
    ],
    observationsUsed: selectedObservations.map((item) =>
      `${item.title}: ${item.why}${item.estimated ? ' (possible opportunity)' : ''}`,
    ),
    qualityChecks: [
      ...(strategy === 'no_website' ? ['Confirm that the business truly has no website; the prospect record only shows that none was found.'] : []),
      prospect.business_name ? 'Business name taken from the prospect record.' : 'No business name recorded; generic greeting used.',
      selectedObservations.length || !analysis ? 'No unsupported website findings added.' : 'No clear finding available; message avoids an unsupported claim.',
      includeReport && analysis && prospect.website
        ? 'The matching website review PDF will be attached when the email is sent.'
        : 'No report attachment is claimed.',
    ],
    includesReportReference: includeReport && !!analysis && !!prospect.website,
    wordCount: wordCount(body),
  }
}

export function validateProfessionalEmailDraft(
  draft: GeneratedEmailDraft,
  prospect: DraftProspect,
  hasMatchingAnalysis: boolean,
  subject: string,
): EmailDraftValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const body = draft.body.toLowerCase()
  const isContextualReply = draft.qualityChecks.some((check) =>
    check.startsWith('Written as a response type selected by the operator'),
  )
  const isFollowUp = draft.qualityChecks.some((check) =>
    check.startsWith('Follow-up context comes from a previously sent email.'),
  )

  if (draft.subjectSuggestions.length < 3 || draft.subjectSuggestions.length > 5) {
    errors.push('Provide between three and five subject suggestions.')
  }
  if (!subject.trim()) errors.push('The email subject is empty.')
  if (subject.length > 100) warnings.push('Consider shortening the subject line.')
  if (!draft.body.trim()) errors.push('The email message is empty.')
  if (
    prospect.business_name.trim() &&
    !normalizedDraftIdentity(body).includes(normalizedDraftIdentity(prospect.business_name))
  ) {
    errors.push('The message does not include the selected business name.')
  }
  if (
    /guarantee(?:d|s)?|will (?:double|triple|increase) (?:your )?(?:revenue|sales|enquiries|leads)/i.test(draft.body)
  ) {
    errors.push('The message makes an unsupported business-results promise.')
  }
  if (containsExternalAuditReference(`${subject}\n${draft.body}`)) {
    errors.push('Remove external accessibility audit references from the customer-facing email.')
  }
  if (!isContextualReply) {
    if (!/if this is not relevant, let us know and we will not follow up/i.test(draft.body)) {
      errors.push('Add a clear opt-out so the recipient can stop further contact.')
    }
    if ((draft.body.match(/\?/g) ?? []).length !== 1) {
      errors.push('Include one clear, low-pressure question.')
    }
    if (containsEmailJargon(`${subject}\n${draft.body}`)) {
      errors.push('Remove technical terms or measurements from the customer-facing email.')
    }
    if (
      prospect.website &&
      !isFollowUp &&
      draft.observationsUsed.length > 0 &&
      !/a focused change may address this issue without a full redesign/i.test(draft.body)
    ) {
      errors.push('Clarify that the audit does not automatically call for a complete redesign.')
    }
  }
  const hasReportToAttach = draft.includesReportReference && hasMatchingAnalysis && !!prospect.website
  if (/your website review is attached|we have attached|please see the attached/i.test(draft.body) && !hasReportToAttach) {
    errors.push('The email says a website report is attached, but no matching review is available to include.')
  }
  if (draft.includesReportReference && !hasMatchingAnalysis) {
    errors.push('The message refers to a website review that is not available for this prospect.')
  }
  if (
    draft.includesReportReference &&
    !/your website review is attached.*audit findings and our recommendations/i.test(draft.body)
  ) {
    errors.push('Describe the attached review accurately and mention its findings and recommendations.')
  }
  if (draft.includesReportReference && !isFollowUp && !isContextualReply) {
    if (!/it.s good to see/i.test(body)) {
      errors.push('Open the audit-based email with a positive, evidence-based acknowledgement.')
    }
  }
  if (draft.observationsUsed.some((observation) => !observation.trim())) {
    errors.push('A referenced observation is missing its evidence.')
  }
  if (!/\?/.test(draft.body)) warnings.push('Consider adding a clear, low-pressure question.')
  const signatureStart = draft.body.search(/\n\n(?:Kind regards|Best wishes|Regards),\n/)
  const auditCopy = signatureStart >= 0 ? draft.body.slice(0, signatureStart) : draft.body
  const auditCopyWords = wordCount(auditCopy)
  if (draft.includesReportReference && !isContextualReply && !isFollowUp && (auditCopyWords < 70 || auditCopyWords > 150)) {
    warnings.push('Audit-based first-touch emails should contain 70-150 words before the signature; review the message length.')
  } else if (!draft.includesReportReference && (draft.wordCount < 80 || draft.wordCount > 190)) {
    warnings.push('This draft is outside the usual 80-190 word range; review its length.')
  }

  return { errors, warnings }
}

export function rewriteProfessionalEmail(body: string, action: RewriteAction) {
  const lines = body.split('\n')
  if (action === 'shorten') {
    const content = lines.filter((line) => line.trim())
    const removable = content.findIndex((line) =>
      /Our review found strong results|We help businesses plan and deliver|We help businesses consider practical website improvements/i.test(line),
    )
    if (removable >= 0) content.splice(removable, 1)
    return content.join('\n\n')
  }
  if (action === 'expand') {
    if (/We do not have enough verified website review information/.test(body)) return body
    const line = 'Any suggested work would be based on the pages and measurements available, and we would confirm the details with you before recommending a change.'
    return body.includes(line) ? body : body.replace(/\n\n(Would|If this is not relevant)/, `\n\n${line}\n\n$1`)
  }
  if (action === 'improve_cta') {
    return body.replace(
      /Would (?:it be helpful to talk this through|a short conversation be useful|you be open to a brief conversation about your priorities)\?/i,
      'Would you be open to a brief, no-obligation conversation about this?',
    )
  }
  if (action === 'conversational') {
    return body
      .replace(/^Kind regards,/m, 'Best wishes,')
      .replace(/^Regards,/m, 'Best wishes,')
      .replace('We reviewed ', 'We took a look at ')
  }
  return body
    .replace(/^Best wishes,/m, 'Kind regards,')
    .replace('We took a look at ', 'We reviewed ')
}

export function generateFollowUpDraft(
  original: Pick<EmailDraft, 'subject' | 'body'>,
  prospect: DraftProspect,
  stage: Exclude<FollowUpStage, 'none'>,
  signature?: Partial<OutreachSignature>,
  includeReport = false,
) {
  const topic = original.subject.replace(/^(Re:\s*)+/i, '').trim() || 'our earlier website email'
  const name = prospect.business_name.trim() || 'your business'
  const industry = prospect.business_category?.trim()
  const offering = prospectOffering(industry)
  const tone: OutreachTone = stage === 'second' ? 'direct' : 'professional'
  const signatureDetails: OutreachSignature = { ...DEFAULT_OUTREACH_SIGNATURE, ...signature }
  const followUpText = stage === 'first'
    ? `We wanted to follow up on our earlier note about ${name}. If useful, we can discuss a few practical ways to present your ${offering} and help interested people get in touch.`
    : stage === 'second'
      ? `We are checking once more in case a few practical changes to ${name}'s online presence may help visitors understand your ${offering}. If you would like to explore them, simply reply and we can arrange a brief conversation.`
      : `We will leave it here for now regarding ${name}. If improving how your business is presented online becomes a priority later, we would be happy to reconnect.`
  const reassurance = prospect.website
    ? 'We are not necessarily suggesting a complete redesign; focused changes may be enough.'
    : 'If website work is not a priority right now, that is completely fine.'
  const cta = stage === 'final'
    ? '\n\nWould it be helpful to reconnect if this becomes a priority later?'
    : '\n\nWould a short conversation be useful?'
  const reportNote = includeReport && prospect.website
    ? 'Your website review is attached again. The concise PDF outlines the audit findings and our recommendations.'
    : ''
  const body = removeDraftHyphens([
    `Hi ${firstName(prospect.contact_name)},`,
    '',
    followUpText,
    reassurance,
    reportNote,
    cta,
    '',
    'If this is not relevant, let us know and we will not follow up.',
    '',
    signoff(tone, signatureDetails),
  ].filter(Boolean).join('\n'))
  const suggestions = [...new Set([
    `Re: ${topic}`,
    `Following up on ${name}'s website`,
    `A quick follow-up for ${name}`,
  ])].slice(0, 5).map(removeDraftHyphens)

  return {
    subjectSuggestions: suggestions,
    body,
    personalization: [
      `Business: ${name}`,
      ...(prospect.website ? [`Website: ${prospect.website}`] : []),
      ...(prospect.business_category ? [`Industry: ${prospect.business_category}`] : []),
      `Context: previously sent email "${topic}".`,
    ],
    observationsUsed: [`Previous email subject: ${original.subject}`],
    qualityChecks: [
      'Follow-up context comes from a previously sent email.',
      'No claim of a reply or conversation was added.',
      includeReport && prospect.website
        ? 'The matching website review is attached and mentioned.'
        : 'No new audit finding or attachment is claimed.',
    ],
    includesReportReference: includeReport && !!prospect.website,
    wordCount: wordCount(body),
  } satisfies GeneratedEmailDraft
}
