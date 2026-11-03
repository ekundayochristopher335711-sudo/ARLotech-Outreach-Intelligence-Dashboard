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
    impact: 'A longer wait can frustrate potential customers looking for help before they see what you offer. If the main information takes too long to appear, they may return to search results and contact a business that responds sooner.',
  }],
  [/total-blocking-time|\btbt\b|forced-reflow|interaction-to-next-paint|\binp\b/i, {
    title: 'Buttons and links may take a moment to respond',
    impact: 'A delayed response can make a page feel unreliable, especially when someone is trying to use it on a phone. Visitors may struggle to open service details or reach the information they need before giving up.',
  }],
  [/cumulative-layout-shift|\bcls\b/i, {
    title: 'Page content may move while it loads',
    impact: 'When text or buttons move as the page loads, visitors can lose their place or tap the wrong thing. On a phone, that can make a simple call or booking option surprisingly difficult to use.',
  }],
  [/render.blocking/i, {
    title: 'The page may take a moment to show its content',
    impact: 'Some visitors may first see a blank or unfinished page while its content is being prepared. A person comparing local providers may leave before finding your services or contact details.',
  }],
  [/unused.javascript|reduce unused javascript/i, {
    title: 'Extra website features may slow down taps and clicks',
    impact: 'Extra page work can make taps and clicks feel delayed, especially on a phone. Someone trying to call, book, or request a quote may give up if the page does not respond when they expect it to.',
  }],
  [/unused.css|reduce unused css/i, {
    title: 'Parts of the page may take longer to look ready',
    impact: 'If the page styling takes longer to settle, visitors may briefly see a cluttered or unfinished layout. That first impression can make a capable local business feel less dependable.',
  }],
  [/image-alt|image.*alt|content-alt/i, {
    title: 'Some visitors may miss details shown in important images',
    impact: 'Visitors who cannot see an image rely on its written description to understand what it shows. Without one, they may miss important service or trust information and feel less sure about contacting you.',
  }],
  [/color-contrast|low contrast|\bcontrast\b/i, {
    title: 'Some text may be difficult for visitors to read',
    impact: 'Text that blends into its background is harder to read on a phone or in bright light. Visitors can miss service details, opening information, or the next step for getting in touch.',
  }],
  [/server-response-time|document-request-latency|time-to-first-byte/i, {
    title: 'The website may take too long to start loading',
    impact: 'Before any service details appear, a visitor is waiting for the website to begin loading. A long pause at that moment can send someone with an urgent need to another provider.',
  }],
  [/font-display/i, {
    title: 'Some text may be slow to appear',
    impact: 'If words are slow to appear or keep changing, visitors must wait to understand the page. That extra effort can make it harder to quickly find your services or contact details.',
  }],
  [/document-title|html-title|meta-description|content-meta|canonical|crawlable|robots\.txt/i, {
    title: 'Nearby customers may have trouble finding this page in search',
    impact: 'People searching for a nearby service may be less likely to recognize this page as the right result. A clear, relevant search listing helps them understand what you offer before they choose whom to contact.',
  }],
  [/content-h1|h1|heading/i, {
    title: 'The page may not clearly explain what the business offers',
    impact: 'A visitor should be able to tell quickly what the business does and who it serves. If the main message is unclear, someone comparing providers may leave before checking whether you can help.',
  }],
  [/\blists?\b|list-structure|listitem/i, {
    title: 'Service details may be harder for some visitors to follow',
    impact: 'When services or steps are not grouped clearly, visitors may have a harder time scanning the page or following it with reading tools. That can make it less clear how to choose a service or get in touch.',
  }],
]

const technicalOrPressuringLanguage =
  /\b(?:Lighthouse|PageSpeed|LCP|FCP|TBT|CLS|INP|JavaScript|CSS|HTML|DOM|WCAG|SEO|API|KiB|KB|ms|milliseconds?|viewport|payload|metric|canonical|robots\.txt|meta description|score|render.blocking|failed|failure|broken|defective|critical|severe|poor|urgent|crisis)\b|\b\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|s|KiB|KB)\b/i

export function containsEmailJargon(value: string) {
  return technicalOrPressuringLanguage.test(value)
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
  return title && !containsEmailJargon(title)
    ? title
    : 'A website detail may be harder for visitors to use'
}

export function emailFindingImpact(finding: EmailFinding) {
  const searchText = findingSearchText(finding)
  const impact = cleanCustomerText(finding.why_it_matters || finding.explanation || '')
  if (finding.classification === 'observed_visual' && impact && !containsEmailJargon(impact)) {
    return impact
  }
  const matchingCopy = findingCopies.find(([pattern]) => pattern.test(searchText))?.[1]
  if (matchingCopy) return matchingCopy.impact

  if (impact && !containsEmailJargon(impact)) return impact

  if (/performance/i.test(finding.category ?? '')) {
    return 'A frustrating page experience may cause potential customers to leave before they contact you.'
  }
  if (/seo/i.test(finding.category ?? '')) {
    return 'This may make it harder for people searching for your service to understand or find the page.'
  }
  if (/accessibility/i.test(finding.category ?? '')) {
    return 'Some visitors may find it harder to get the information or help they came for.'
  }
  return 'If this issue affects a key page, it may make it harder for visitors to trust your business or get in touch.'
}
