export interface GoogleMapsWebsite {
  business_name: string
  website: string
}

interface Link {
  label: string
  url: string
  index: number
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function plainHtmlText(value: string) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function businessNamesFromRepeatedLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const names: string[] = []

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (
      lines[index].toLowerCase() === lines[index + 1].toLowerCase() &&
      !/^(website|directions|results|share|all filters|saved|recents)$/i.test(lines[index])
    ) {
      names.push(lines[index])
      index += 1
    }
  }

  return names
}

function normalizeWebsiteUrl(value: string): string | null {
  const cleaned = decodeEntities(value.trim()).replace(/[),.;]+$/g, '')
  let url: URL
  try {
    url = new URL(cleaned)
  } catch {
    return null
  }

  if (!/^https?:$/.test(url.protocol)) return null

  if (/^(?:www\.)?google\./i.test(url.hostname) && /^\/(?:maps\/)?url\/?$/i.test(url.pathname)) {
    const destination = url.searchParams.get('q') || url.searchParams.get('url')
    if (destination) return normalizeWebsiteUrl(destination)
  }

  if (/^(?:www\.)?google\./i.test(url.hostname) || /(^|\.)google\./i.test(url.hostname)) return null
  return url.href
}

function isMapsListingUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      /^(?:www\.)?google\.[a-z.]+$/i.test(url.hostname) &&
      (/\/maps\/place\//i.test(url.pathname) || /\/maps\/search\//i.test(url.pathname))
    )
  } catch {
    return false
  }
}

function mapListingsToWebsites(links: Link[]): GoogleMapsWebsite[] {
  const mapListings = links.filter((link) => isMapsListingUrl(link.url))

  return mapListings.flatMap((listing, index) => {
    const nextListingIndex = mapListings[index + 1]?.index ?? Number.POSITIVE_INFINITY
    const websiteLink = links.find(
      (link) =>
        link.index > listing.index &&
        link.index < nextListingIndex &&
        /website|web site|official site/i.test(link.label),
    )
    const website = websiteLink && normalizeWebsiteUrl(websiteLink.url)
    return website ? [{ business_name: listing.label, website }] : []
  })
}

export function extractGoogleMapsWebsitesFromText(text: string): GoogleMapsWebsite[] {
  const links: Link[] = []

  for (const match of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi)) {
    links.push({
      label: match[1].trim(),
      url: decodeEntities(match[2]),
      index: match.index ?? 0,
    })
  }

  return mapListingsToWebsites(links)
}

export function extractGoogleMapsWebsitesFromHtml(html: string, pastedText = ''): GoogleMapsWebsite[] {
  const links: Link[] = []
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const rawUrl = href?.[1] ?? href?.[2] ?? href?.[3]
    if (!rawUrl) continue

    const accessibleLabel = match[1].match(/\b(?:aria-label|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
    links.push({
      label: [
        plainHtmlText(match[2]),
        accessibleLabel?.[1] ?? accessibleLabel?.[2] ?? '',
      ].filter(Boolean).join(' '),
      url: decodeEntities(rawUrl),
      index: match.index ?? 0,
    })
  }

  const linkedListings = mapListingsToWebsites(links)

  const websiteLinks = links.flatMap((link) => {
    if (!/website|web site|official site/i.test(link.label)) return []
    const website = normalizeWebsiteUrl(link.url)
    return website ? [website] : []
  })
  const businessNames = businessNamesFromRepeatedLines(pastedText)

  if (websiteLinks.length === 0 || websiteLinks.length !== businessNames.length) return linkedListings

  const mappedNames = new Set(linkedListings.map(({ business_name }) => business_name.toLowerCase()))
  const mappedWebsites = new Set(linkedListings.map(({ website }) => website.toLowerCase()))
  const fallbackListings = businessNames
    .map((business_name, index) => ({ business_name, website: websiteLinks[index] }))
    .filter(
      ({ business_name, website }) =>
        !mappedNames.has(business_name.toLowerCase()) && !mappedWebsites.has(website.toLowerCase()),
    )

  return [...linkedListings, ...fallbackListings]
}
