import { containsEmailJargon, containsExternalAuditReference } from '@/lib/emailCopy'

const serviceCategories: Array<[RegExp, string]> = [
  [/plumb|heating|hvac|electric|cleaning|maintenance|construction|builder|contractor/i, 'work'],
  [/law|legal|solicitor|attorney/i, 'legal guidance'],
  [/restaurant|food|cafe|hospitality/i, 'menu and dining options'],
  [/real estate|property|estate agent/i, 'property listings'],
  [/photograph|photo|creative|design/i, 'creative work'],
]

const audienceCategories: Array<[RegExp, string]> = [
  [/plumb/i, 'homeowners looking for plumbing help'],
  [/heating|hvac/i, 'people looking for heating or cooling support'],
  [/electric/i, 'people looking for electrical help'],
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

function categoryTeam(category: string) {
  if (/plumb|heating|hvac/i.test(category)) return 'plumbing and heating teams'
  if (/law|legal|solicitor|attorney/i.test(category)) return 'law firms'
  if (/restaurant|food|cafe|hospitality/i.test(category)) return 'restaurants'
  if (/real estate|property|estate agent/i.test(category)) return 'real estate agencies'
  if (/construction|builder|contractor/i.test(category)) return 'construction teams'
  if (/cleaning/i.test(category)) return 'cleaning teams'
  if (/photograph|photo|creative|design/i.test(category)) return 'creative teams'
  return `${category.toLowerCase()} organizations`
}

export function removeDraftHyphens(value: string) {
  const preserved: string[] = []
  const withPlaceholders = value.replace(
    /\b(?:https?:\/\/|www\.)[^\s]+|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    (match) => {
      const placeholder = `__PRESERVED_DRAFT_VALUE_${preserved.length}__`
      preserved.push(match)
      return placeholder
    },
  )
  return withPlaceholders
    .replace(/(\w)[\u2010-\u2015-](\w)/g, '$1 $2')
    .replace(/\s*[\u2010-\u2015-]\s*/g, ', ')
    .replace(/ {2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/__PRESERVED_DRAFT_VALUE_(\d+)__/g, (_match, index: string) => preserved[Number(index)] || '')
}

export function normalizedDraftIdentity(value: string) {
  return value.toLowerCase().replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function prospectOffering(category?: string | null) {
  const value = normalizedCategory(category)
  if (!value) return 'product or service'
  const serviceCategory = serviceCategories.find(([pattern]) => pattern.test(value))
  if (serviceCategory) {
    if (/law|legal|solicitor|attorney/i.test(value)) return 'legal guidance'
    if (/restaurant|food|cafe|hospitality/i.test(value)) return 'menu and dining options'
    if (/real estate|property|estate agent/i.test(value)) return 'property listings'
    if (/photograph|photo|creative|design/i.test(value)) return 'creative work'
    return `${value.toLowerCase()} work`
  }
  return `${value.toLowerCase()} work`
}

export function prospectAudience(category?: string | null) {
  const value = normalizedCategory(category)
  if (!value) return 'people looking for your product or service'
  return audienceCategories.find(([pattern]) => pattern.test(value))?.[1] ??
    `people looking for ${value.toLowerCase()}`
}

export function industryImpactLine(category: string | null | undefined, findingTitle: string) {
  const value = normalizedCategory(category)
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
  return value
    ? `Clearer information can help ${audience} understand how your ${categoryTeam(value)} can help.`
    : `Clearer information can help people understand whether your product or service fits what they need.`
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
    return `It's good to see that the review noted ${safeTitle.charAt(0).toLowerCase()}${safeTitle.slice(1)} on ${businessName}'s website.`
  }
  const value = normalizedCategory(category)
  if (value) {
    return `It's good to see ${businessName}'s website is already available to people looking for ${value.toLowerCase()}.`
  }
  const offering = prospectOffering(category)
  return `It's good to see ${businessName} has an online presence for its ${offering}.`
}

export function industryWebsiteImprovementLine(category?: string | null, businessName?: string) {
  const value = normalizedCategory(category)
  const namedBusiness = businessName?.trim()
  if (!value) {
    return `At Arlotech Digital Solutions, we help businesses${namedBusiness ? ` such as ${namedBusiness}` : ''} identify and address these issues through practical website improvements, without necessarily requiring a complete redesign.`
  }
  return `At Arlotech Digital Solutions, we help ${categoryTeam(value)}${namedBusiness ? ` such as ${namedBusiness}` : ''} identify and address website issues through practical improvements, without necessarily requiring a complete redesign.`
}

export function feedbackRequest() {
  return 'Would this be something you’d consider improving?'
}
