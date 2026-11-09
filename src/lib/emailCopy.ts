type EmailFinding = {
  id?: string
  audit_id?: string
  title?: string
  category?: string
  classification?: string
  why_it_matters?: string
  explanation?: string | null
}

type FindingCopy = {
  title: string
  impact: string
}

const findingCopies: Array<[RegExp, FindingCopy]> = [
  [/largest-contentful-paint|\blcp\b/i, {
    title: 'The main page content takes too long to appear',
    impact: 'A longer wait can frustrate someone looking for help. If the main information takes too long to appear, they may return to search results and contact someone else.',
  }],
  [/total-blocking-time|\btbt\b|forced-reflow|interaction-to-next-paint|\binp\b/i, {
    title: 'Buttons and links may take a moment to respond',
    impact: 'A delayed response can make a page feel unreliable, especially on a phone. Visitors may struggle to open a page or find the information they need.',
  }],
  [/cumulative-layout-shift|\bcls\b/i, {
    title: 'Page content may move while it loads',
    impact: 'When text or buttons move as the page loads, visitors can lose their place or tap the wrong thing. On a phone, that can make a simple call or booking option surprisingly difficult to use.',
  }],
  [/render.blocking/i, {
    title: 'The page may take a moment to show its content',
    impact: 'Some visitors may first see a blank or unfinished page while its content is being prepared. They may leave before finding the information they need.',
  }],
  [/unused.javascript|reduce unused javascript/i, {
    title: 'How additional website features may affect responsiveness, particularly on mobile devices',
    impact: 'Delays can create friction for visitors trying to call, book, or request a quote.',
  }],
  [/unused.css|reduce unused css/i, {
    title: 'Parts of the page may take longer to look ready',
    impact: 'If the page styling takes longer to settle, visitors may briefly see a cluttered or unfinished layout. That first impression may not reflect the quality of your work.',
  }],
  [/image-alt|image.*alt|content-alt/i, {
    title: 'Some visitors may miss details shown in important images',
    impact: 'Visitors who cannot see an image rely on its written description to understand what it shows. Without one, they may miss important details and feel less sure about getting in touch.',
  }],
  [/link-name|link.*name|discernible.*link/i, {
    title: 'Some links may be unclear to visitors',
    impact: 'When a link does not clearly explain where it leads, visitors may be unsure what to expect. Clear wording can make it easier to find information or reach your team.',
  }],
  [/link-in-text-block|link.*text.*block|distinguishable.*link/i, {
    title: 'Some links may be difficult to spot within the text',
    impact: 'When links look too similar to the surrounding text, visitors may overlook useful information. Making links easy to spot can help people find the next step.',
  }],
  [/color-contrast|low contrast|\bcontrast\b/i, {
    title: 'Some text may be difficult for visitors to read',
    impact: 'Text that blends into its background is harder to read on a phone or in bright light. Visitors can miss key details, opening times, or the next step for getting in touch.',
  }],
  [/server-response-time|document-request-latency|time-to-first-byte/i, {
    title: 'The website may take too long to start loading',
    impact: 'Visitors must wait for the website to begin loading before they can see any details. A long pause can send someone with an urgent need to another website.',
  }],
  [/font-display/i, {
    title: 'Some text may be slow to appear',
    impact: 'If words are slow to appear or keep changing, visitors must wait to understand the page. That extra effort can make it harder to find information or contact your team.',
  }],
  [/document-title|html-title|meta-description|content-meta|canonical|crawlable|robots\.txt/i, {
    title: 'People nearby may have trouble finding this page in search',
    impact: 'People searching nearby may be less likely to recognize this page as the right result. A clear, relevant search listing helps them understand what is available before they choose whom to contact.',
  }],
  [/content-h1|h1|heading/i, {
    title: 'The page may not clearly explain what you do',
    impact: 'Visitors should be able to tell quickly what you do and whom you help. If the main message is unclear, someone comparing options may leave before checking whether you can help.',
  }],
  [/\blists?\b|list-structure|listitem/i, {
    title: 'Details may be harder for some visitors to follow',
    impact: 'When information or steps are not grouped clearly, visitors may have a harder time scanning the page or following it with reading tools. That can make the next step less clear.',
  }],
]

const technicalOrPressuringLanguage =
  /\b(?:Lighthouse|PageSpeed|LCP|FCP|TBT|CLS|INP|JavaScript|CSS|HTML|DOM|WCAG|SEO|API|KiB|KB|ms|milliseconds?|viewport|payload|metric|canonical|robots\.txt|meta description|score|render.blocking|failed|failure|broken|defective|critical|severe|poor|urgent|crisis)\b|\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|s|KiB|KB)\b/i

export function containsEmailJargon(value: string) {
  return technicalOrPressuringLanguage.test(value)
}

export function containsExternalAuditReference(value: string) {
  return /dequeuniversity\.com|axe\/\d+\.\d+\/|learn how to make links (?:accessible|distinguishable)/i.test(value)
}

function findingSearchText(finding: EmailFinding) {
  return `${finding.audit_id ?? ''} ${finding.id ?? ''} ${finding.title ?? ''}`
}

function cleanCustomerText(value: string) {
  return value
    .replace(/\bI am\b/gi, 'we are')
    .replace(/\bI have\b/gi, 'we have')
    .replace(/\bI will\b/gi, 'we will')
    .replace(/\bI\b/g, 'we')
    .replace(/\bmy\b/gi, 'our')
    .replace(/\bme\b/gi, 'us')
    .trim()
}

export function emailFindingTitle(finding: EmailFinding) {
  const searchText = findingSearchText(finding)
  const matchingCopy = findingCopies.find(([pattern]) => pattern.test(searchText))?.[1]
  if (matchingCopy && finding.classification !== 'observed_visual') return matchingCopy.title

  const title = cleanCustomerText(finding.title ?? '')
  return title && !containsEmailJargon(title) && !containsExternalAuditReference(title)
    ? title
    : 'A website detail may be harder for visitors to use'
}

export function emailFindingImpact(finding: EmailFinding) {
  const searchText = findingSearchText(finding)
  const impact = cleanCustomerText(finding.why_it_matters || finding.explanation || '')
  if (
    finding.classification === 'observed_visual' &&
    impact &&
    !containsEmailJargon(impact) &&
    !containsExternalAuditReference(impact)
  ) {
    return impact
  }
  const matchingCopy = findingCopies.find(([pattern]) => pattern.test(searchText))?.[1]
  if (matchingCopy) return matchingCopy.impact

  if (impact && !containsEmailJargon(impact) && !containsExternalAuditReference(impact)) return impact

  if (/performance/i.test(finding.category ?? '')) {
    return 'A frustrating page experience may cause visitors to leave before they get in touch.'
  }
  if (/seo/i.test(finding.category ?? '')) {
    return 'This may make it harder for people looking for you to understand or find the page.'
  }
  if (/accessibility/i.test(finding.category ?? '')) {
    return 'Some visitors may find it harder to get the information or help they came for.'
  }
  return 'If this issue affects a key page, it may make it harder for visitors to trust your business or get in touch.'
}
