const PHONE_CANDIDATE_PATTERN = /(?<![\w])(?:\+|00)?\d(?:[\d\s()./\-\u2010-\u2015\u2212]{4,}\d)(?![\w])/g
const PHONE_LINK_PATTERN = /tel:([^"'<>\s]+)/gi
const HTML_ENTITY_PATTERN = /&(#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi

const HTML_PHONE_ENTITIES: Record<string, string> = {
  amp: '&',
  emsp: ' ',
  ensp: ' ',
  hairsp: ' ',
  mdash: '-',
  minus: '-',
  nbsp: ' ',
  ndash: '-',
  plus: '+',
  thinsp: ' ',
}

function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY_PATTERN, (entity, reference: string) => {
    if (reference.startsWith('#')) {
      const isHex = reference[1]?.toLowerCase() === 'x'
      const codePoint = Number.parseInt(reference.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity
    }
    return HTML_PHONE_ENTITIES[reference.toLowerCase()] ?? entity
  })
}

function phoneSearchText(source: string): string {
  return decodeHtmlEntities(source.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ')
}

interface PhoneCountry {
  region: string
  callingCode: string
  trunkPrefix: string
  names: string[]
  domainSuffixes?: string[]
}

const PHONE_COUNTRIES: PhoneCountry[] = [
  { region: 'AR', callingCode: '54', trunkPrefix: '0', names: ['Argentina'] },
  { region: 'AU', callingCode: '61', trunkPrefix: '0', names: ['Australia'] },
  { region: 'AT', callingCode: '43', trunkPrefix: '0', names: ['Austria'] },
  { region: 'BD', callingCode: '880', trunkPrefix: '0', names: ['Bangladesh'] },
  { region: 'BE', callingCode: '32', trunkPrefix: '0', names: ['Belgium'] },
  { region: 'BR', callingCode: '55', trunkPrefix: '0', names: ['Brazil'] },
  { region: 'CA', callingCode: '1', trunkPrefix: '', names: ['Canada'] },
  { region: 'CL', callingCode: '56', trunkPrefix: '0', names: ['Chile'] },
  { region: 'CN', callingCode: '86', trunkPrefix: '0', names: ['China'] },
  { region: 'CO', callingCode: '57', trunkPrefix: '0', names: ['Colombia'] },
  { region: 'CZ', callingCode: '420', trunkPrefix: '', names: ['Czechia', 'Czech Republic'] },
  { region: 'DK', callingCode: '45', trunkPrefix: '', names: ['Denmark'] },
  { region: 'EG', callingCode: '20', trunkPrefix: '0', names: ['Egypt'] },
  { region: 'FI', callingCode: '358', trunkPrefix: '0', names: ['Finland'] },
  { region: 'FR', callingCode: '33', trunkPrefix: '0', names: ['France'] },
  { region: 'DE', callingCode: '49', trunkPrefix: '0', names: ['Germany'] },
  { region: 'GH', callingCode: '233', trunkPrefix: '0', names: ['Ghana'] },
  { region: 'GR', callingCode: '30', trunkPrefix: '0', names: ['Greece'] },
  { region: 'HK', callingCode: '852', trunkPrefix: '', names: ['Hong Kong'] },
  { region: 'IN', callingCode: '91', trunkPrefix: '0', names: ['India'] },
  { region: 'ID', callingCode: '62', trunkPrefix: '0', names: ['Indonesia'] },
  { region: 'IE', callingCode: '353', trunkPrefix: '0', names: ['Ireland'] },
  { region: 'IL', callingCode: '972', trunkPrefix: '0', names: ['Israel'] },
  { region: 'IT', callingCode: '39', trunkPrefix: '', names: ['Italy'] },
  { region: 'JP', callingCode: '81', trunkPrefix: '0', names: ['Japan'] },
  { region: 'KE', callingCode: '254', trunkPrefix: '0', names: ['Kenya'] },
  { region: 'MY', callingCode: '60', trunkPrefix: '0', names: ['Malaysia'] },
  { region: 'MX', callingCode: '52', trunkPrefix: '', names: ['Mexico'] },
  { region: 'NL', callingCode: '31', trunkPrefix: '0', names: ['Netherlands'] },
  { region: 'NZ', callingCode: '64', trunkPrefix: '0', names: ['New Zealand'] },
  { region: 'NG', callingCode: '234', trunkPrefix: '0', names: ['Nigeria', 'Nigerian'] },
  { region: 'NO', callingCode: '47', trunkPrefix: '', names: ['Norway'] },
  { region: 'PK', callingCode: '92', trunkPrefix: '0', names: ['Pakistan'] },
  { region: 'PE', callingCode: '51', trunkPrefix: '0', names: ['Peru'] },
  { region: 'PH', callingCode: '63', trunkPrefix: '0', names: ['Philippines'] },
  { region: 'PL', callingCode: '48', trunkPrefix: '0', names: ['Poland'] },
  { region: 'PT', callingCode: '351', trunkPrefix: '', names: ['Portugal'] },
  { region: 'RO', callingCode: '40', trunkPrefix: '0', names: ['Romania'] },
  { region: 'RU', callingCode: '7', trunkPrefix: '8', names: ['Russia', 'Russian Federation'] },
  { region: 'SA', callingCode: '966', trunkPrefix: '0', names: ['Saudi Arabia'] },
  { region: 'SG', callingCode: '65', trunkPrefix: '', names: ['Singapore'] },
  { region: 'ZA', callingCode: '27', trunkPrefix: '0', names: ['South Africa'] },
  { region: 'KR', callingCode: '82', trunkPrefix: '0', names: ['South Korea', 'Republic of Korea'] },
  { region: 'ES', callingCode: '34', trunkPrefix: '', names: ['Spain'] },
  { region: 'SE', callingCode: '46', trunkPrefix: '0', names: ['Sweden'] },
  { region: 'CH', callingCode: '41', trunkPrefix: '0', names: ['Switzerland'] },
  { region: 'TW', callingCode: '886', trunkPrefix: '0', names: ['Taiwan'] },
  { region: 'TH', callingCode: '66', trunkPrefix: '0', names: ['Thailand'] },
  { region: 'TR', callingCode: '90', trunkPrefix: '0', names: ['Turkey', 'Türkiye'] },
  { region: 'AE', callingCode: '971', trunkPrefix: '0', names: ['United Arab Emirates', 'UAE'] },
  { region: 'GB', callingCode: '44', trunkPrefix: '0', names: ['United Kingdom', 'Great Britain', 'England', 'Scotland', 'Wales'], domainSuffixes: ['uk'] },
  { region: 'US', callingCode: '1', trunkPrefix: '', names: ['United States', 'United States of America', 'USA'] },
  { region: 'VN', callingCode: '84', trunkPrefix: '0', names: ['Vietnam'] },
]

function phoneCountryFromPage(pageUrl: string, language: string | null, sources: string[]): PhoneCountry | null {
  const hostname = new URL(pageUrl).hostname.toLowerCase()
  const domainCountry = PHONE_COUNTRIES.find(({ region, domainSuffixes }) =>
    [region.toLowerCase(), ...(domainSuffixes ?? [])].some((suffix) => hostname.endsWith(`.${suffix}`)),
  )
  if (domainCountry) return domainCountry

  const languageRegion = language?.match(/[-_]([a-z]{2})(?:$|[-_])/i)?.[1]?.toUpperCase()
  const languageCountry = PHONE_COUNTRIES.find(({ region }) => region === languageRegion)
  if (languageCountry) return languageCountry

  const pageText = sources.join('\n')
  const countryMatches = PHONE_COUNTRIES.filter(({ names, callingCode }) =>
    names.some((name) => {
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`\\b${escapedName}\\b`, 'i').test(pageText)
    }) || new RegExp(`(?:\\+|00)\\s*${callingCode}\\b`).test(pageText),
  )
  return countryMatches.length === 1 ? countryMatches[0] : null
}

function normalizePhoneCandidate(value: string, country: PhoneCountry | null): string | null {
  const withoutExtension = value.replace(/(?:;|,|\s)(?:ext\.?|extension|x|#)\s*\d+\s*$/i, '').trim()
  const hasInternationalPrefix = /^\s*(?:\+|00)/.test(withoutExtension)
  let digits = withoutExtension.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length < 7 || digits.length > 15) return null

  if (hasInternationalPrefix) {
    if (country && digits.startsWith(country.callingCode)) {
      let nationalNumber = digits.slice(country.callingCode.length)
      if (country.trunkPrefix && nationalNumber.startsWith(country.trunkPrefix)) {
        nationalNumber = nationalNumber.slice(country.trunkPrefix.length)
      }
      return `+${country.callingCode}${nationalNumber}`
    }
    return `+${digits}`
  }
  if (country) {
    if (digits.startsWith(country.callingCode) && digits.length >= country.callingCode.length + 7) {
      let nationalNumber = digits.slice(country.callingCode.length)
      if (country.trunkPrefix && nationalNumber.startsWith(country.trunkPrefix)) {
        nationalNumber = nationalNumber.slice(country.trunkPrefix.length)
      }
      return `+${country.callingCode}${nationalNumber}`
    }

    if (country.trunkPrefix && digits.startsWith(country.trunkPrefix)) {
      digits = digits.slice(country.trunkPrefix.length)
    }
    const internationalNumber = `${country.callingCode}${digits}`
    if (internationalNumber.length <= 15) return `+${internationalNumber}`
  }
  return withoutExtension.replace(/\s+/g, ' ').trim()
}

export function extractPhoneNumbers(sources: string[], pageUrl: string, language: string | null): string[] {
  const country = phoneCountryFromPage(pageUrl, language, sources)
  const phones = new Set<string>()

  for (const source of sources) {
    for (const match of source.matchAll(PHONE_LINK_PATTERN)) {
      const encodedCandidate = decodeHtmlEntities(match[1].split('?', 1)[0])
      let candidate: string
      try {
        candidate = decodeURIComponent(encodedCandidate)
      } catch {
        candidate = encodedCandidate
      }
      const phone = normalizePhoneCandidate(candidate, country)
      if (phone) phones.add(phone)
    }
  }

  for (const source of sources) {
    const text = phoneSearchText(source)
    for (const candidateSource of text === source ? [source] : [text, source]) {
      for (const match of candidateSource.matchAll(PHONE_CANDIDATE_PATTERN)) {
        const phone = normalizePhoneCandidate(match[0], country)
        if (phone) phones.add(phone)
      }
    }
  }

  return [...phones]
}
