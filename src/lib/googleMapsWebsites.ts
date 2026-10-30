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

export function extractGoogleMapsWebsitesFromHtml(html: string): GoogleMapsWebsite[] {
  const links: Link[] = []
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const rawUrl = href?.[1] ?? href?.[2] ?? href?.[3]
    if (!rawUrl) continue

    links.push({
      label: plainHtmlText(match[2]),
      url: decodeEntities(rawUrl),
      index: match.index ?? 0,
    })
  }

  return mapListingsToWebsites(links)
}
