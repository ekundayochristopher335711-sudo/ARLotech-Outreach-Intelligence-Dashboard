const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const EMAIL_TEXT_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

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

export function extractEmailAddresses(sources: string[]): string[] {
  const emails = new Set<string>()
  for (const source of sources) {
    const decodedSource = decodeEmailEntities(source)
    for (const match of decodedSource.matchAll(EMAIL_TEXT_PATTERN)) {
      emails.add(match[0].toLowerCase())
    }
    for (const match of source.matchAll(/mailto:([^"'<>\s]+)/gi)) {
      const candidate = decodeMailto(match[1].split('?', 1)[0]).trim().toLowerCase()
      if (EMAIL_PATTERN.test(candidate)) emails.add(candidate)
    }
  }
  return [...emails]
}
