export const MAX_WEBSITE_CONTEXT_ADDITIONAL_PAGES = 3

const relevantPagePattern =
  /\b(?:about|services?|products?|solutions?|what we do|our work|offerings?|menu|specialt(?:y|ies))\b/i

export interface WebsiteContextPageInput {
  label: string
  url: string
  title?: string | null
  metaDescription?: string | null
  headings?: Record<string, string[]>
  textExcerpt?: string
  status?: number
  error?: string
}

export interface WebsiteContextSnapshot {
  version: 1
  captured_at: string
  pages: Array<{
    source_url: string
    source_label: string
    extraction_status: 'completed' | 'failed'
    http_status: number | null
    title: string
    meta_description: string
    headings: string[]
    text_excerpt: string
    error?: string
  }>
}

function cleanText(value: unknown, limit: number) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, limit)
    : ''
}

export function selectRelevantWebsitePages(
  primaryUrl: string,
  navigationPages: Array<{ label: string; url: string }>,
  limit = MAX_WEBSITE_CONTEXT_ADDITIONAL_PAGES,
) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new RangeError('The website context page limit must be a non-negative integer.')
  }
  let origin: string
  try {
    origin = new URL(primaryUrl).origin
  } catch {
    return []
  }

  const selected: Array<{ label: string; url: string }> = []
  const seen = new Set([new URL(primaryUrl).href])
  for (const page of navigationPages) {
    if (selected.length >= limit) break
    const label = cleanText(page.label, 100)
    if (!relevantPagePattern.test(`${label} ${page.url}`)) continue
    try {
      const url = new URL(page.url, primaryUrl)
      if (
        url.origin !== origin ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) continue
      url.hash = ''
      if (seen.has(url.href)) continue
      seen.add(url.href)
      selected.push({ label: label || url.pathname, url: url.href })
    } catch {
      continue
    }
  }
  return selected
}

export function buildWebsiteContextSnapshot(
  pages: WebsiteContextPageInput[],
  capturedAt = new Date().toISOString(),
): WebsiteContextSnapshot {
  const normalizedPages = pages.slice(0, MAX_WEBSITE_CONTEXT_ADDITIONAL_PAGES + 1).map((page, index) => {
    const headings = Object.entries(page.headings || {})
      .flatMap(([tag, values]) => values.map((value) => ({ tag, value })))
      .filter(({ value }) => cleanText(value, 120))
      .slice(0, 5)
      .map(({ tag, value }) => `${tag.toUpperCase()}: ${cleanText(value, 120)}`)
    const extractionStatus = page.error ? 'failed' : 'completed'
    return {
      source_url: cleanText(page.url, 500),
      source_label: cleanText(page.label, 100) || (index === 0 ? 'Homepage' : 'Website page'),
      extraction_status: extractionStatus as 'completed' | 'failed',
      http_status: typeof page.status === 'number' && Number.isFinite(page.status) ? page.status : null,
      title: cleanText(page.title, 180),
      meta_description: cleanText(page.metaDescription, 280),
      headings,
      text_excerpt: cleanText(page.textExcerpt, index === 0 ? 1600 : 1000),
      ...(page.error ? { error: cleanText(page.error, 240) } : {}),
    }
  })

  return {
    version: 1,
    captured_at: capturedAt,
    pages: normalizedPages,
  }
}
