import type { EmailDraft, Prospect, WebsiteAnalysis } from '@/types'
import { auditFindingTitle, auditFindingWhy } from '@/lib/auditReportLanguage'
import { rateCategoryScore, rateLighthouseFinding } from '@/lib/websiteAudit'

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
  [/construction|builder|contractor/i, 'presenting services and completed work clearly to prospective customers'],
  [/real estate|property|estate agent/i, 'making property information and enquiry options easy to navigate'],
  [/photograph|photo|creative|design/i, 'presenting work clearly and making it easy for visitors to enquire or book'],
]

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || 'there'
}

function categoryName(category: string) {
  if (category.toLowerCase() === 'seo') return 'SEO'
  return category.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function analysisStrengths(analysis?: DraftAnalysis | null) {
  if (!analysis?.category_scores) return []
  return Object.entries(analysis.category_scores)
    .filter(([, score]) => rateCategoryScore(score) === 'Good')
    .map(([category, score]) => `${categoryName(category)} (${score}/100)`)
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
    title: finding.classification === 'observed_visual' ? finding.title || 'Visual observation' : auditFindingTitle(finding),
    why: finding.why_it_matters || auditFindingWhy(finding),
    evidence: (finding.display_value || finding.evidence || '').trim(),
    estimated: finding.classification === 'optimization_opportunity',
    visual: finding.classification === 'observed_visual',
  }))
}

function toneOpening(tone: OutreachTone, name: string) {
  if (tone === 'friendly' || tone === 'conversational') return `We hope your week is going well. We were looking at ${name}'s website and wanted to share a brief observation.`
  if (tone === 'direct') return `We reviewed ${name}'s website and found one area that may be worth a closer look.`
  if (tone === 'premium') return `Our team at Arlotech Digital Solutions reviewed ${name}'s website and noted a possible opportunity to refine the experience.`
  if (tone === 'consultative') return `We took a look at ${name}'s website and wanted to share a couple of considered observations for your team to weigh up.`
  return `We reviewed ${name}'s website and wanted to share a brief, practical observation.`
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
              ? `A quick introduction from Arlotech`
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
    businessName: 'Arlotech Digital Solutions',
    senderName: '',
    jobTitle: '',
    website: '',
    email: '',
    phone: '',
    socialLinks: '',
    ...input.signature,
  }
  const strengths = analysisStrengths(analysis)
  const observations = candidateObservations(analysis)
  const industry = prospect.business_category?.trim() || ''
  const industryContext = industryContexts.find(([pattern]) => pattern.test(industry))?.[1]
  const availableFacts: string[] = []
  if (prospect.website) availableFacts.push(`Prospect website recorded as ${prospect.website}.`)
  if (industry) availableFacts.push(`Prospect category recorded as ${industry}.`)
  if (strengths.length) availableFacts.push(`Positive measured areas: ${strengths.join(', ')}.`)
  if (observations.length) availableFacts.push(...observations.map((observation) => observation.title))

  const lines = [`Hi ${greetingName},`, '']
  const originalTopic = input.originalSubject
    ? input.originalSubject.replace(/^(Re:\s*)+/i, '').trim()
    : ''
  const topic = observations[0]?.title || originalTopic || 'website experience'
  const senderContext = input.senderContext?.trim()
  const contextualReply = strategy === 'interested_response' || strategy === 'pricing_response' || strategy === 'meeting_request'
  if (contextualReply && followUpStage === 'none') {
    const contextLine = senderContext ? `\n\n${senderContext}` : ''
    const replyBody = strategy === 'interested_response'
      ? `Hi ${greetingName},\n\nThank you for getting back to us. We appreciate your interest in exploring improvements to ${name}'s online presence.\n\nThe best next step is to understand what you want the website to achieve, what is working well today, and what you would like to improve. From there, we can suggest a sensible scope rather than recommending work you may not need.${contextLine}\n\nWould you be available for a brief conversation this week?\n\nKind regards,\n${signoff(tone, signature).split('\n').slice(1).join('\n')}`
      : strategy === 'pricing_response'
        ? `Hi ${greetingName},\n\nThanks for asking about pricing. The cost depends on the scope of work, the pages or features required, and whether this is a new website, a redesign, or improvements to an existing site.\n\nWe would rather confirm what you need first and give you a clear quote than suggest a figure that does not match the project.${contextLine}\n\nIf you share a little about what you have in mind, we can outline the most suitable option and its cost.\n\nKind regards,\n${signoff(tone, signature).split('\n').slice(1).join('\n')}`
        : `Hi ${greetingName},\n\nThanks for considering Arlotech Digital Solutions. It would be useful to arrange a short call to understand your goals for ${name}'s website and agree on the most practical next steps.${contextLine}\n\nWould you be available for a 15-minute conversation? Feel free to suggest a day and time that works for you.\n\nKind regards,\n${signoff(tone, signature).split('\n').slice(1).join('\n')}`
    const replySubject = strategy === 'pricing_response' ? `Re: Website project pricing for ${name}` : strategy === 'meeting_request' ? `A quick call about ${name}'s website` : `Re: ${name} website enquiry`
    return {
      subjectSuggestions: [replySubject, `Next steps for ${name}`, `Arlotech Digital Solutions | ${name}`],
      body: replyBody,
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
    lines.push(`We came across ${name}${industry ? ` while looking at ${industry.toLowerCase()} businesses` : ''}. We couldn't find a website associated with your business in the information available to us, so we wanted to reach out in case building one is something you have been considering.`)
  } else if (strategy === 'cold_outreach') {
    lines.push(`We came across ${name}${industry ? ` while researching ${industry.toLowerCase()} businesses` : ''} and wanted to briefly introduce Arlotech Digital Solutions. We build and improve websites for businesses that want a clearer, more useful online presence.`)
  } else if (prospect.website && analysis) {
    lines.push(toneOpening(tone, name))
  } else {
    lines.push(`We came across ${name}${industry ? ` while looking at ${industry.toLowerCase()} businesses` : ''} and wanted to introduce Arlotech Digital Solutions.`)
  }

  if (strengths.length) {
    lines.push(`Our review found strong results in ${strengths.slice(0, 3).join(', ')}.`, '')
  }

  const strategyObservation = ['no_website', 'cold_outreach'].includes(strategy)
    ? undefined
    : (strategy === 'technical_improvement' || strategy === 'seo_performance')
      ? observations.find((item) => /speed|performance|load|javascript|css|blocking|response|accessibility|contrast|seo|search/i.test(item.title))
    : strategy === 'website_redesign'
      ? observations.find((item) => item.visual)
      : strategy === 'business_growth'
        ? observations.find((item) => /contact|form|navigation|heading|service|booking|link/i.test(item.title))
        : observations[0]
  const selectedObservations = strategyObservation
    ? [strategyObservation, ...(length === 'detailed' ? observations.filter((item) => item !== strategyObservation).slice(0, 1) : [])]
    : []

  if (selectedObservations.length) {
    for (const observation of selectedObservations) {
      const evidencePhrase = observation.estimated
        ? 'PageSpeed flagged a possible improvement, rather than a confirmed defect'
        : `our review recorded ${observation.evidence}`
      lines.push(`We noticed ${observation.title.toLowerCase()}: ${evidencePhrase}. ${observation.why}`)
    }
    lines.push('')
  } else if (strategy === 'website_redesign' && !observations.some((item) => item.visual)) {
    lines.push('We do not have a verified visual observation to support a redesign recommendation, so we would be glad to discuss your goals before suggesting changes.', '')
  } else if (analysis && strengths.length && !['no_website', 'cold_outreach'].includes(strategy)) {
    lines.push('We did not identify a confirmed issue that warrants a problem-focused message, so we would be happy to discuss optional refinements if they are relevant to your plans.', '')
  } else if ((!analysis || !observations.length) && !['no_website', 'cold_outreach'].includes(strategy)) {
    lines.push('We do not have enough verified website review information to make a technical claim, so we will not guess at specific issues.', '')
  }

  const valueLine = strategy === 'no_website'
    ? 'We can help plan and build a responsive website that explains your services, showcases your work, and gives potential customers a straightforward way to contact you.'
    : strategy === 'seo_performance'
      ? analysis ? 'We help businesses improve the technical foundations and search visibility of their websites, with recommendations based on measured results rather than guesswork.' : 'We can review the technical foundations and search visibility of your website, then recommend practical improvements based on what the checks show.'
      : industryContext
        ? `We help businesses improve their websites, including ${industryContext}.`
        : 'We design, build, and improve business websites, from focused landing pages to larger custom web experiences.'
  lines.push(valueLine)

  if (strategy === 'business_growth' && industryContext) {
    lines.push('Any changes would depend on your goals; we cannot promise a particular increase in enquiries or sales.')
  } else if (strategy === 'website_redesign' && selectedObservations.length) {
    lines.push('If useful, we can discuss whether a visual or structural update would suit your goals; we would base any recommendation on the pages reviewed.')
  } else if (strategy === 'personal_consultancy') {
    lines.push('We would be glad to understand your priorities first and suggest only changes that make sense for your business.')
  } else {
    lines.push('We would be happy to talk through the observation and whether any next step makes sense for your business.')
  }
  if (senderContext) lines.push(`Additional project detail: ${senderContext}`)
  lines.push('')

  if (includeReport && analysis && prospect.website) {
    lines.push('We have prepared a short website review with the recorded observations and recommendations, and can share it if useful.', '')
  }

  const cta = followUpStage === 'final'
    ? 'If this is not a priority right now, no problem. We will leave it there, and the door remains open if circumstances change.'
    : strategy === 'no_website'
      ? 'Would you be open to seeing a simple outline of what a website for your business could include?'
      : strategy === 'cold_outreach'
        ? 'Would it be useful if we sent over a couple of ideas for your online presence?'
        : tone === 'direct'
      ? 'Would a short conversation be useful?'
      : tone === 'consultative'
        ? 'Would you be open to a brief conversation about your priorities?'
        : 'Would it be helpful to talk this through?'
  lines.push(cta)
  if (followUpStage !== 'final') lines.push('', 'If this is not relevant, let us know and we will not follow up.')
  lines.push('', signoff(tone, signature))

  let body = lines.join('\n')
  if (length === 'short') {
    body = body
      .replace(/Our review found strong results in [^\n]+\n\n/, '')
      .replace(/We help businesses consider practical website improvements[^\n]*\n/, '')
      .replace(/We help businesses plan and deliver practical website improvements[^\n]*\n/, '')
  } else if (length === 'detailed' && selectedObservations.length === 1 && observations.length > 1) {
    const extra = observations.find((item) => item !== selectedObservations[0])
    if (extra) body = body.replace('\n\nWe help', `\nWe also noted ${extra.title.toLowerCase()}: ${extra.why}\n\nWe help`)
  }

  if (tone === 'friendly' || tone === 'conversational') {
    body = body.replace('We would be happy to talk this through.', 'We would be glad to have a quick, informal chat if that suits you.')
  }

  const suggestions = followUpStage !== 'none' && input.originalSubject
    ? [...new Set([`Re: ${input.originalSubject.replace(/^(Re:\s*)+/i, '')}`, ...subjectOptions(name, strategy, topic)])].slice(0, 5)
    : subjectOptions(name, strategy, topic)
  return {
    subjectSuggestions: suggestions,
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
      `${item.title}: ${item.evidence}${item.estimated ? ' (estimated opportunity)' : ''}`,
    ),
    qualityChecks: [
      ...(strategy === 'no_website' ? ['Confirm that the business truly has no website; the prospect record only shows that none was found.'] : []),
      prospect.business_name ? 'Business name taken from the prospect record.' : 'No business name recorded; generic greeting used.',
      selectedObservations.length || !analysis ? 'No unsupported website findings added.' : 'No confirmed finding available; message avoids a defect claim.',
      includeReport && analysis && prospect.website ? 'Website review reference included; the message does not claim that a file is attached.' : 'No report attachment is claimed.',
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

  if (draft.subjectSuggestions.length < 3 || draft.subjectSuggestions.length > 5) {
    errors.push('Provide between three and five subject suggestions.')
  }
  if (!subject.trim()) errors.push('The email subject is empty.')
  if (subject.length > 100) warnings.push('Consider shortening the subject line.')
  if (!draft.body.trim()) errors.push('The email message is empty.')
  if (prospect.business_name.trim() && !body.includes(prospect.business_name.trim().toLowerCase())) {
    errors.push('The message does not include the selected business name.')
  }
  if (
    /guarantee(?:d|s)?|will (?:double|triple|increase) (?:your )?(?:revenue|sales|enquiries|leads)/i.test(draft.body)
  ) {
    errors.push('The message makes an unsupported business-results promise.')
  }
  if (/we have attached|please see the attached/i.test(draft.body)) {
    errors.push('The message claims a file is attached, but this draft has no saved attachment.')
  }
  if (draft.includesReportReference && !hasMatchingAnalysis) {
    errors.push('The message refers to a website review that is not available for this prospect.')
  }
  if (draft.observationsUsed.some((observation) => !observation.trim())) {
    errors.push('A referenced observation is missing its evidence.')
  }
  if (!/\?/.test(draft.body)) warnings.push('Consider adding a clear, low-pressure question.')
  if (draft.wordCount < 80 || draft.wordCount > 190) {
    warnings.push('This draft is outside the usual 100-180 word range; review its length.')
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
) {
  const topic = original.subject.replace(/^(Re:\s*)+/i, '').trim() || 'our earlier website email'
  const name = prospect.business_name.trim() || 'your business'
  const tone: OutreachTone = stage === 'second' ? 'direct' : 'professional'
  const signatureDetails: OutreachSignature = {
    businessName: 'Arlotech Digital Solutions',
    senderName: '',
    jobTitle: '',
    website: '',
    email: '',
    phone: '',
    socialLinks: '',
    ...signature,
  }
  const followUpText = stage === 'first'
    ? `We wanted to follow up on our earlier note about "${topic}". If this is relevant to your plans, we would be glad to talk through the website observations and answer any questions.`
    : stage === 'second'
      ? `We are checking once more about "${topic}". If you would like to explore it, simply reply and we can arrange a brief conversation.`
      : `We will close the loop on "${topic}" for now. If website improvements become a priority later, we would be happy to reconnect. No reply is needed if the timing is not right.`
  const cta = stage === 'final' ? '' : '\n\nWould a short conversation be useful?'
  const body = [
    `Hi ${firstName(prospect.contact_name)},`,
    '',
    followUpText,
    cta,
    '',
    'If this is not relevant, let us know and we will not follow up.',
    '',
    signoff(tone, signatureDetails),
  ].filter(Boolean).join('\n')
  const suggestions = [...new Set([
    `Re: ${topic}`,
    `Following up on ${name}'s website`,
    `A quick follow-up for ${name}`,
  ])].slice(0, 5)

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
      'No new audit finding or attachment is claimed.',
    ],
    includesReportReference: false,
    wordCount: wordCount(body),
  } satisfies GeneratedEmailDraft
}
