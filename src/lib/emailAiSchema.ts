export const AI_EMAIL_APPROACHES = [
  'professional',
  'friendly',
  'audit_based',
  'value_first',
  'short',
  'website_redesign',
] as const

export type AiEmailApproach = typeof AI_EMAIL_APPROACHES[number]

export interface AiEmailContextReference {
  id: string
  source_label: string
  source_url: string
  title: string
}

interface AiEmailResponse {
  analysis_id: string | null
  email_type: string
  prospect: {
    business_name: string
    website: string
    industry: string
  }
  sender: {
    name: string
    business: string
    email: string
  }
  subject_suggestions: string[]
  body: string
  referenced_observation_ids: string[]
  referenced_observations: string[]
  referenced_context_page_ids: string[]
  referenced_context_pages: AiEmailContextReference[]
  recommended_call_to_action: string
  personalization_confidence: 'high' | 'medium' | 'low'
  assistant_message?: string
}

export function isAiEmailResponse(value: unknown): value is AiEmailResponse {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  const prospect = result.prospect
  const contextPageIds = Array.isArray(result.referenced_context_page_ids)
    ? result.referenced_context_page_ids
    : null
  return (typeof result.analysis_id === 'string' || result.analysis_id === null) &&
    !!prospect &&
    typeof prospect === 'object' &&
    'business_name' in prospect &&
    typeof prospect.business_name === 'string' &&
    'website' in prospect &&
    typeof prospect.website === 'string' &&
    'industry' in prospect &&
    typeof prospect.industry === 'string' &&
    !!result.sender &&
    typeof result.sender === 'object' &&
    'name' in result.sender &&
    typeof result.sender.name === 'string' &&
    'business' in result.sender &&
    typeof result.sender.business === 'string' &&
    'email' in result.sender &&
    typeof result.sender.email === 'string' &&
    typeof result.email_type === 'string' &&
    Array.isArray(result.subject_suggestions) &&
    result.subject_suggestions.length === 3 &&
    result.subject_suggestions.every((subject) =>
      typeof subject === 'string' && !!subject.trim() && subject.length <= 200,
    ) &&
    typeof result.body === 'string' &&
    !!result.body.trim() &&
    result.body.length <= 12_000 &&
    Array.isArray(result.referenced_observation_ids) &&
    result.referenced_observation_ids.every((id) => typeof id === 'string') &&
    Array.isArray(result.referenced_observations) &&
    result.referenced_observations.every((observation) => typeof observation === 'string') &&
    result.referenced_observations.length === result.referenced_observation_ids.length &&
    contextPageIds !== null &&
    contextPageIds.every((id) => typeof id === 'string') &&
    Array.isArray(result.referenced_context_pages) &&
    result.referenced_context_pages.every((page) =>
      !!page &&
      typeof page === 'object' &&
      typeof page.id === 'string' &&
      typeof page.source_label === 'string' &&
      typeof page.source_url === 'string' &&
      /^https?:\/\//i.test(page.source_url) &&
      typeof page.title === 'string',
    ) &&
    result.referenced_context_pages.length === contextPageIds.length &&
    result.referenced_context_pages.every((page, index) => page.id === contextPageIds[index]) &&
    typeof result.recommended_call_to_action === 'string' &&
    (result.assistant_message === undefined ||
      (typeof result.assistant_message === 'string' && result.assistant_message.length <= 300)) &&
    ['high', 'medium', 'low'].includes(String(result.personalization_confidence))
}
