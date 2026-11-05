const PHONE_CANDIDATE_PATTERN = /(?<![\w])(?:\+|00)?\d(?:[\d\s()./-]{4,}\d)(?![\w])/g
const PHONE_LINK_PATTERN = /tel:([^"'<>\s]+)/gi

function phoneRegionFromPage(pageUrl: string, language: string | null, sources: string[]): string | null {
  const languageRegion = language?.match(/[-_]([a-z]{2})$/i)?.[1]?.toUpperCase()
  if (languageRegion) return languageRegion

  const hostname = new URL(pageUrl).hostname.toLowerCase()
  if (hostname.endsWith('.ng')) return 'NG'
  if (sources.some((source) => /\bNigeri(?:a|an)\b|\+234/i.test(source))) return 'NG'
  if (hostname.endsWith('.uk')) return 'GB'
  if (hostname.endsWith('.au')) return 'AU'
  if (hostname.endsWith('.ca')) return 'CA'
  if (hostname.endsWith('.ie')) return 'IE'
  if (hostname.endsWith('.za')) return 'ZA'
  return null
}

function normalizePhoneCandidate(value: string, region: string | null): string | null {
  const withoutExtension = value.replace(/(?:;|,|\s)(?:ext\.?|extension|x|#)\s*\d+\s*$/i, '').trim()
  const hasInternationalPrefix = /^\s*(?:\+|00)/.test(withoutExtension)
  let digits = withoutExtension.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length < 7 || digits.length > 15) return null

  if (region === 'NG' && digits.startsWith('234')) {
    if (digits.length === 14 && digits[3] === '0') digits = `234${digits.slice(4)}`
    return digits.length === 13 ? `+${digits}` : null
  }
  if (region === 'NG' && digits.length === 11 && digits.startsWith('0')) {
    return `+234${digits.slice(1)}`
  }
  if (hasInternationalPrefix) return `+${digits}`
  return withoutExtension.replace(/\s+/g, ' ').trim()
}

export function extractPhoneNumbers(sources: string[], pageUrl: string, language: string | null): string[] {
  const region = phoneRegionFromPage(pageUrl, language, sources)
  const phones = new Set<string>()

  for (const source of sources) {
    for (const match of source.matchAll(PHONE_LINK_PATTERN)) {
      let candidate: string
      try {
        candidate = decodeURIComponent(match[1].split(/[?#]/, 1)[0])
      } catch {
        candidate = match[1].split(/[?#]/, 1)[0]
      }
      const phone = normalizePhoneCandidate(candidate, region)
      if (phone) phones.add(phone)
    }
  }

  for (const source of sources) {
    for (const match of source.matchAll(PHONE_CANDIDATE_PATTERN)) {
      const phone = normalizePhoneCandidate(match[0], region)
      if (phone) phones.add(phone)
    }
  }

  return [...phones]
}
