import { containsEmailJargon, containsExternalAuditReference } from '@/lib/emailCopy'

const serviceCategories: Array<[RegExp, string]> = [
  [/plumb|heating|hvac|electric|cleaning|maintenance|construction|builder|contractor/i, 'services'],
  [/law|legal|solicitor|attorney/i, 'legal services'],
  [/restaurant|food|cafe|hospitality/i, 'menu and dining options'],
  [/real estate|property|estate agent/i, 'property listings and related services'],
  [/photograph|photo|creative|design/i, 'creative services'],
]

const audienceCategories: Array<[RegExp, string]> = [
  [/plumb/i, 'homeowners looking for plumbing help'],
  [/heating|hvac/i, 'people looking for heating or cooling support'],
  [/electric/i, 'people looking for electrical services'],
  [/law|legal|solicitor|attorney/i, 'people seeking legal guidance'],
  [/restaurant|food|cafe|hospitality/i, 'people deciding where to eat'],
  [/real estate|property|estate agent/i, 'people comparing properties'],
  [/construction|builder|contractor/i, 'people planning building work'],
  [/cleaning/i, 'people looking for cleaning help'],
  [/maintenance/i, 'people looking for property maintenance'],
]

function normalizedCategory(category?: string | null) {
  return category?.trim().replace(/\s+/g, ' ') || ''
}

export function prospectOffering(category?: string | null) {
  const value = normalizedCategory(category)
  if (!value) return 'product or service'
  const serviceCategory = serviceCategories.find(([pattern]) => pattern.test(value))
  if (serviceCategory) {
    if (/law|legal|solicitor|attorney/i.test(value)) return 'legal services'
    if (/restaurant|food|cafe|hospitality/i.test(value)) return 'menu and dining options'
    if (/real estate|property|estate agent/i.test(value)) return 'property listings and related services'
    if (/photograph|photo|creative|design/i.test(value)) return 'creative services'
    return `${value.toLowerCase()} services`
  }
  return `${value.toLowerCase()} products or services`
}

export function prospectAudience(category?: string | null) {
  const value = normalizedCategory(category)
  if (!value) return 'people looking for your product or service'
  return audienceCategories.find(([pattern]) => pattern.test(value))?.[1] ??
    `people interested in your ${value.toLowerCase()} business`
}

export function industryImpactLine(category: string | null | undefined, findingTitle: string) {
  const audience = prospectAudience(category)
  if (/search|find|visibility/i.test(findingTitle)) {
    return `A clearer search listing may help ${audience} recognize that the page is relevant before deciding where to go next.`
  }
  if (/contact|form|button|link|navigation|booking|enquir/i.test(findingTitle)) {
    return `A simpler next step may make it easier for ${audience} to reach your team.`
  }
  if (/load|respond|slow|movement/i.test(findingTitle)) {
    return `A smoother page may help ${audience} reach the information they need without unnecessary delay.`
  }
  return `Clearer information can help ${audience} understand whether your offering fits what they need.`
}

export function positiveWebsiteAcknowledgement(
  businessName: string,
  category?: string | null,
  observationTitle?: string | null,
) {
  const safeTitle = observationTitle?.trim()
  if (
    safeTitle &&
    safeTitle.length <= 100 &&
    !containsEmailJargon(safeTitle) &&
    !containsExternalAuditReference(safeTitle)
  ) {
    return `It's good to see that the review noted ${safeTitle.charAt(0).toLowerCase()}${safeTitle.slice(1)}.`
  }
  const offering = prospectOffering(category)
  return `It's good to see ${businessName} has an online presence for its ${offering}.`
}

export function feedbackRequest() {
  return "We'd appreciate your feedback: are these areas you would be interested in improving, or is there something else you'd like your website to achieve for your business?"
}
