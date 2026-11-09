import {
  containsEmailJargon,
  containsExternalAuditReference,
  emailFindingImpact,
} from '@/lib/emailCopy'

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
  if (!value) return 'work'
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
  if (!value) return 'people looking for your business'
  if (/plumb|heating|hvac/i.test(value)) return 'people looking for plumbing or heating support'
  return audienceCategories.find(([pattern]) => pattern.test(value))?.[1] ??
    `people looking for ${value.toLowerCase()}`
}

export function personalizedEmailFindingImpact(
  finding: Parameters<typeof emailFindingImpact>[0],
  category?: string | null,
) {
  const searchText = `${finding.audit_id ?? ''} ${finding.id ?? ''} ${finding.title ?? ''}`
  if (!/image-alt|image.*alt|content-alt/i.test(searchText)) return emailFindingImpact(finding)

  const value = normalizedCategory(category)
  if (!value) {
    return 'Visitors who use screen readers rely on written descriptions to understand meaningful images. When a photo shows your work or services, a short description can help explain what it shows.'
  }

  const imageExample = /plumb|heating|hvac|electric|construction|builder|contractor/i.test(value)
    ? 'relevant installation or project photos'
    : /restaurant|food|cafe|hospitality/i.test(value)
      ? 'relevant food or dining photos'
      : /real estate|property|estate agent/i.test(value)
        ? 'relevant property photos'
        : /law|legal|solicitor|attorney/i.test(value)
          ? 'relevant team or office photos'
          : /photograph|photo|creative|design/i.test(value)
            ? 'relevant portfolio photos'
            : 'relevant images of your work'
  return `Visitors who use screen readers rely on written descriptions to understand meaningful images. For a ${value.toLowerCase()} business, descriptions on ${imageExample} can help ${prospectAudience(value)} understand what the images show.`
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
    : 'Clearer information can help people understand what your business offers and whether it fits what they need.'
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

export function industryWebsiteImprovementLine() {
  return 'Arlotech Digital Solutions designs and builds new websites, and improves existing ones with focused updates.'
}

export function feedbackRequest() {
  return 'Would you be open to discussing what might work best for your website?'
}
