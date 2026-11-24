const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const EMAIL_TEXT_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const STRUCTURED_EMAIL_PATTERN = /["']email["']\s*:\s*["']([^"']+)["']/gi
const PLACEHOLDER_DOMAINS = new Set(['domain.com', 'email.com', 'example.com', 'example.net', 'example.org', 'test.com'])

function decodeEmailEntities(value: string) {
  return value
    .replace(/&#(?:x40|64);/gi, '@')
    .replace(/&commat;/gi, '@')
    .replace(/&#(?:x2e|46);/gi, '.')
    .replace(/&(?:period|dot);/gi, '.')
}

function decodeMailto(value: string) {
  const entityDecoded = decodeEmailEntities(value)
  try {
    return decodeURIComponent(entityDecoded)
  } catch {
    return entityDecoded
  }
}

function isUsefulEmail(value: string) {
  if (!EMAIL_PATTERN.test(value)) return false
  const domain = value.split('@')[1]
  return !PLACEHOLDER_DOMAINS.has(domain)
}

export function extractEmailAddresses(sources: string[]): string[] {
  const emails = new Set<string>()
  for (const source of sources) {
    const visibleSource = source.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    const decodedSource = decodeEmailEntities(visibleSource)
    for (const match of decodedSource.matchAll(EMAIL_TEXT_PATTERN)) {
      const candidate = match[0].toLowerCase()
      if (isUsefulEmail(candidate)) emails.add(candidate)
    }
    for (const match of visibleSource.matchAll(/mailto:([^"'<>\s]+)/gi)) {
      const candidate = decodeMailto(match[1].split('?', 1)[0]).trim().toLowerCase()
      if (isUsefulEmail(candidate)) emails.add(candidate)
    }
    for (const match of source.matchAll(STRUCTURED_EMAIL_PATTERN)) {
      const candidate = decodeMailto(match[1]).trim().toLowerCase()
      if (isUsefulEmail(candidate)) emails.add(candidate)
    }
  }
  return [...emails]
}
