interface AuditFindingCopy {
  title: string
  whyItMatters: string
  recommendation: string
}

interface AuditFindingInput {
  id?: string | null
  audit_id?: string | null
  title?: string | null
  category?: string | null
  recommended_fix?: string | null
}

const findingCopy: Array<[RegExp, AuditFindingCopy]> = [
  [/largest-contentful-paint|largest contentful paint|\blcp\b/i, {
    title: 'Main content loading time (Largest Contentful Paint, LCP)',
    whyItMatters: 'LCP measures how long the main content takes to appear. A longer time may make visitors wait before they can use the page.',
    recommendation: 'We recommend reviewing the main content and the resources needed to display it. PageSpeed lists the measured time and any related opportunities below.',
  }],
  [/total-blocking-time|total blocking time|\btbt\b/i, {
    title: 'Time the page is busy before it responds (Total Blocking Time, TBT)',
    whyItMatters: 'TBT estimates how long the page may be too busy to respond promptly while loading. This can make the website feel slow to use.',
    recommendation: 'We recommend reviewing the scripts and page work identified by Lighthouse, then checking that the page responds smoothly after any changes.',
  }],
  [/cumulative-layout-shift|cumulative layout shift|\bcls\b/i, {
    title: 'Unexpected page movement while loading (Cumulative Layout Shift, CLS)',
    whyItMatters: 'CLS measures unexpected movement as a page loads. Moving text or buttons can make it harder for visitors to read or select the right thing.',
    recommendation: 'We recommend checking the elements that move and reserving space for images, ads, or other content before they load.',
  }],
  [/render-blocking-resources|render.blocking/i, {
    title: 'Files are delaying the page from showing its content',
    whyItMatters: 'Some files must load before the page can show its content. Delays may leave visitors waiting for a blank or incomplete page.',
    recommendation: 'We recommend reviewing the listed CSS and JavaScript files and checking whether any can load later without hiding important content.',
  }],
  [/unused-javascript|reduce unused javascript/i, {
    title: 'Some JavaScript may not be needed when the page first loads',
    whyItMatters: 'JavaScript is code that adds actions to a website. Loading code that is not needed right away may make the page slower to load or respond.',
    recommendation: 'We recommend checking the listed JavaScript files to see whether unused code can be removed or loaded only when needed.',
  }],
  [/unused-css|reduce unused css/i, {
    title: 'Some styling code may not be needed on this page',
    whyItMatters: 'CSS controls how a website looks. Unneeded styling files may add to the amount visitors must download.',
    recommendation: 'We recommend checking the listed CSS files and removing styles that the page does not use, after confirming they are not needed elsewhere.',
  }],
  [/uses-optimized-images|uses-responsive-images|modern-image-formats|efficiently-encode-images|image-delivery|offscreen-images/i, {
    title: 'Website images could be prepared to load faster',
    whyItMatters: 'Large or unnecessarily heavy images can take longer to load, especially for visitors on slower connections.',
    recommendation: 'We recommend reviewing the listed images and using suitable file sizes and formats while keeping them clear. Any savings shown are estimates, not guaranteed results.',
  }],
  [/server-response-time|document-request-latency|time-to-first-byte/i, {
    title: 'The website took time to start sending the page',
    whyItMatters: 'Visitors cannot see the page until the website begins sending it. A slower response may add to the time they wait.',
    recommendation: 'We recommend asking your hosting or development team to review the response time for the listed page and check for avoidable delays.',
  }],
  [/font-display/i, {
    title: 'Text may wait for a font file before appearing',
    whyItMatters: 'If a font takes time to load, visitors may see blank or changing text while they wait.',
    recommendation: 'We recommend checking the font loading settings so text remains readable while custom fonts load.',
  }],
  [/document-title|html-title/i, {
    title: 'The page title is missing or unclear',
    whyItMatters: 'The page title helps visitors identify a page in browser tabs and can help search engines understand what the page is about.',
    recommendation: 'We recommend checking the title on the fully loaded page and adding a clear, accurate title if it is missing.',
  }],
  [/meta-description|content-meta/i, {
    title: 'A search description was not found in the inspected page HTML',
    whyItMatters: 'A meta description can help describe a page in search results, although search engines may choose different text.',
    recommendation: 'We recommend checking the fully loaded page and its search listing before adding a concise, accurate description.',
  }],
  [/is-crawlable|crawlability/i, {
    title: 'Search engines may have difficulty accessing this page',
    whyItMatters: 'If search engines cannot access a page, they may not be able to include it in search results.',
    recommendation: 'We recommend checking the page’s access settings and confirming the result in Google Search Console or the relevant search engine tools.',
  }],
  [/robots-txt|robots\.txt/i, {
    title: 'Check the website instructions for search engines (robots.txt)',
    whyItMatters: 'The robots.txt file gives search crawlers instructions about which areas to visit. Incorrect rules may limit access to pages.',
    recommendation: 'We recommend reviewing robots.txt at the website root to confirm its instructions are intentional. This audit does not confirm whether pages are indexed.',
  }],
  [/canonical/i, {
    title: 'Check which website address search engines should treat as the main one (canonical URL)',
    whyItMatters: 'A canonical URL signals which address should represent a page when similar versions exist. An incorrect setting may confuse search engines.',
    recommendation: 'We recommend confirming that the canonical URL points to the intended page and uses the correct HTTP or HTTPS address.',
  }],
  [/image-alt|image.*alt|content-alt/i, {
    title: 'Some images may need a text description for screen readers',
    whyItMatters: 'Alternative text describes meaningful images to people using screen readers. Decorative images can correctly have empty alternative text.',
    recommendation: 'We recommend reviewing each image in context and adding a short, useful description only where the image conveys information.',
  }],
  [/color-contrast/i, {
    title: 'Some text may be difficult to read against its background',
    whyItMatters: 'Low contrast can make text harder to read, particularly for people with low vision or viewing the site in bright light.',
    recommendation: 'We recommend checking the affected text and adjusting its text or background colors to improve readability.',
  }],
  [/content-h1|h1|heading/i, {
    title: 'A main page heading was not found in the inspected HTML',
    whyItMatters: 'A clear main heading helps visitors understand what a page covers. This check inspected the page HTML and may not include content added later by JavaScript.',
    recommendation: 'We recommend checking the fully loaded page before changing its heading structure, since some websites add headings after the initial HTML loads.',
  }],
]

function getFindingCopy(finding: AuditFindingInput): AuditFindingCopy | null {
  const searchText = `${finding.audit_id || ''} ${finding.id || ''} ${finding.title || ''}`
  return findingCopy.find(([pattern]) => pattern.test(searchText))?.[1] ?? null
}

export function auditFindingTitle(finding: AuditFindingInput) {
  return getFindingCopy(finding)?.title || finding.title || 'Website observation'
}

export function auditFindingEmailTopic(finding: AuditFindingInput) {
  const searchText = `${finding.audit_id || ''} ${finding.id || ''} ${finding.title || ''}`
  if (/largest-contentful-paint|\blcp\b|unused-javascript|render.blocking|server-response-time|document-request-latency/i.test(searchText)) {
    return 'faster page loading'
  }
  if (/unused-css|image-delivery|optimized-images|responsive-images|modern-image-formats|offscreen-images/i.test(searchText)) {
    return /image-delivery|optimized-images|responsive-images|modern-image-formats|offscreen-images/i.test(searchText)
      ? 'faster-loading images'
      : 'simpler page styling'
  }
  if (/meta-description|content-meta|canonical|crawlable|robots\.txt/i.test(searchText)) return 'search visibility'
  if (/color-contrast|low contrast|contrast|accessibility/i.test(searchText)) return 'easier-to-read text'
  if (/content-h1|h1|heading/i.test(searchText)) return 'a clearer page heading'
  if (/cumulative-layout-shift|\bcls\b/i.test(searchText)) return 'a steadier page layout'
  if (/total-blocking-time|\btbt\b|forced-reflow/i.test(searchText)) return 'a more responsive page'
  return 'a website improvement'
}

export function auditFindingWhy(finding: AuditFindingInput) {
  const copy = getFindingCopy(finding)
  if (copy) return copy.whyItMatters

  const category = finding.category?.replace(/-/g, ' ')
  if (category === 'seo') {
    return 'This search-related result may affect how search engines understand or display the page. It does not by itself confirm an indexing or ranking problem.'
  }
  if (category === 'accessibility') {
    return 'This result may make the website harder for some people to use. Our assessment did not test every visitor or assistive technology.'
  }
  if (category === 'performance') {
    return 'This performance result may affect how quickly or smoothly visitors can use the page.'
  }
  return 'This result identifies something worth reviewing on the website. Its effect depends on the page and how visitors use it.'
}

export function auditFindingRecommendation(finding: AuditFindingInput) {
  const copy = getFindingCopy(finding)
  if (copy) return copy.recommendation

  const title = finding.title?.trim()
  if (finding.recommended_fix?.trim()) {
    return `We recommend reviewing “${title || 'this result'}”. A practical next step is: ${finding.recommended_fix.trim()}`
  }
  return `We recommend reviewing “${title || 'this result'}” and the related evidence before making changes.`
}

export function clientFriendlyAuditText(value: string) {
  const replacePhrase = (text: string, pattern: RegExp, replacement: string) =>
    text.replace(pattern, (_match, offset: number, source: string) => {
      const sentenceStart = offset === 0 || /[.!?]\s*$/.test(source.slice(0, offset))
      const firstLetter = sentenceStart
        ? replacement.charAt(0).toUpperCase()
        : replacement.charAt(0).toLowerCase()
      return firstLetter + replacement.slice(1)
    })

  let text = value
    .replace(/\bI['’]m\b/gi, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? "We're" : "we're")
    .replace(/\bI['’]ve\b/gi, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? "We've" : "we've")
    .replace(/\bI['’]ll\b/gi, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? "We'll" : "we'll")
    .replace(/\bI['’]d\b/gi, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? "We'd" : "we'd")
    .replace(/\bI recommend\b/gi, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? 'We recommend' : 'we recommend')
    .replace(/\bI found\b/gi, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? 'We found' : 'we found')
    .replace(/\bmy\b/gi, 'our')
    .replace(/\bme\b/gi, 'us')
    .replace(/\bI\b/g, (_match, offset, text) => /(^|[.!?]\s+)$/.test(text.slice(0, offset)) ? 'We' : 'we')
  text = replacePhrase(text, /Optimize image delivery/gi, 'make website images load faster')
  text = replacePhrase(text, /Reduce unused JavaScript/gi, 'remove unnecessary website code that may slow down loading')
  text = replacePhrase(text, /Eliminate render-blocking resources/gi, 'fix files that delay your website from displaying its content')
  text = replacePhrase(text, /Address forced reflows/gi, 'fix activities that can slow down how smoothly your website responds')
  text = replacePhrase(text, /Improve crawlability/gi, 'make it easier for search engines to explore your website')
  text = text
    .replace(/\bforced reflows?\b/gi, 'activities that can slow down how smoothly the website responds')
    .replace(/\boptimize image delivery\b/gi, 'make website images load faster')
    .replace(/\bunused JavaScript\b/gi, 'unnecessary website code')
    .replace(/\brender-blocking resources?\b/gi, 'files that delay the website from displaying content')
    .replace(/\bcrawlability\b/gi, 'how easily search engines can explore the website')
    .replace(
      /Lighthouse did not return valid scores for: (.+)\./i,
      'PageSpeed did not return valid scores for these areas: $1.',
    )
    .replace(
      /HTML extraction failed: .+/i,
      'We could not inspect some page details because the page HTML was unavailable.',
    )
    .replace(
      /Desktop PageSpeed failed; the primary technical scores are from the mobile run\./i,
      'We could not get a desktop PageSpeed result, so the scores shown are from the mobile check.',
    )
    .replace(
      /Only the primary page was assessed; multi-page visual review was not requested\./i,
      'Our assessment covered only the main page. We did not request a visual review of other pages.',
    )
    .replace(
      /Visual review was limited to (\d+) same-origin page\(s\) and initial-load screenshots\./i,
      'We visually reviewed $1 page(s) from the same website using screenshots from the first page load.',
    )
    .replace(
      /Sitemap and robots\.txt availability, broken links, JavaScript-rendered states, and interactive controls were not independently tested\./i,
      'We did not check sitemap or robots.txt availability, broken links, content added later by JavaScript, or interactive controls.',
    )
  return text
}
