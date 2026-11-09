export interface NavigationPage {
  label: string
  url: string
}

export function extractNavigationPages(html: string, pageUrl: string, limit = 10): NavigationPage[] {
  const baseUrl = new URL(pageUrl)
  baseUrl.hash = ''
  pageUrl = baseUrl.href
  const origin = baseUrl.origin
  if (limit <= 0) return []
  const pages = new Map<string, NavigationPage>()

  const collectLinks = (source: string) => {
    for (const [, attributes, body] of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attributes.match(/(?:^|\s)href\s*=\s*(["'])(.*?)\1/i)?.[2]
      if (!href || href.startsWith('#')) continue

      try {
        const target = new URL(href.replace(/&amp;/gi, '&'), pageUrl)
        if (
          target.origin !== origin ||
          !['http:', 'https:'].includes(target.protocol) ||
          target.username ||
          target.password
        ) continue

        target.hash = ''
        const url = target.href
        if (url === pageUrl || pages.has(url)) continue
        const label = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        pages.set(url, { label: label.slice(0, 100) || target.pathname, url })
        if (pages.size >= limit) return
      } catch {
        continue
      }
    }
  }

  for (const [, navHtml] of html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)) {
    collectLinks(navHtml)
    if (pages.size >= limit) return [...pages.values()]
  }

  if (pages.size === 0) collectLinks(html)
  return [...pages.values()]
}
