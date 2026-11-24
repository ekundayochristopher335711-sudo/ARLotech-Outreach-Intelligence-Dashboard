const CONTACT_PAGE_PATTERN = /\b(contact|contact us|get in touch|reach us|enquir(?:y|ies)|inquir(?:y|ies))\b/i
const ABOUT_PAGE_PATTERN = /\b(about|company|who we are)\b/i
const TEAM_PAGE_PATTERN = /\b(team|staff|people|meet)\b/i
const LEGAL_PAGE_PATTERN = /\b(imprint|legal)\b/i

function pagePriority(label: string): number {
  if (CONTACT_PAGE_PATTERN.test(label)) return 0
  if (ABOUT_PAGE_PATTERN.test(label)) return 1
  if (TEAM_PAGE_PATTERN.test(label)) return 2
  if (LEGAL_PAGE_PATTERN.test(label)) return 3
  return Number.POSITIVE_INFINITY
}

export function findContactPageUrls(html: string, pageUrl: string, limit = 3): string[] {
  if (limit <= 0) return []

  const baseUrl = new URL(pageUrl)
  baseUrl.hash = ''
  const candidates = new Map<string, { url: string; priority: number; pathDepth: number; position: number }>()

  for (const [, attributes, body] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const rawHref = attributes.match(/(?:^|\s)href\s*=\s*(["'])(.*?)\1/i)?.[2]
    if (!rawHref) continue

    const label = `${body.replace(/<[^>]*>/g, ' ')} ${rawHref}`.replace(/\s+/g, ' ').trim()
    const priority = pagePriority(label)
    if (!Number.isFinite(priority)) continue

    try {
      const target = new URL(rawHref.replace(/&amp;/gi, '&'), baseUrl)
      if (
        target.origin !== baseUrl.origin ||
        !['http:', 'https:'].includes(target.protocol) ||
        target.username ||
        target.password
      ) continue

      target.hash = ''
      if (target.href === baseUrl.href) continue
      const current = candidates.get(target.href)
      if (!current || priority < current.priority) {
        candidates.set(target.href, {
          url: target.href,
          priority,
          pathDepth: target.pathname.split('/').filter(Boolean).length,
          position: candidates.size,
        })
      }
    } catch {
      continue
    }
  }

  return [...candidates.values()]
    .sort((left, right) =>
      left.priority - right.priority || left.pathDepth - right.pathDepth || left.position - right.position,
    )
    .slice(0, limit)
    .map(({ url }) => url)
}
