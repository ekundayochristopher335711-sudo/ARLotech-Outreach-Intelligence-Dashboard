export interface ExtractedBusinessLocation {
  city: string
  country: string
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
}

function schemaCountry(value: unknown): string {
  if (typeof value === 'string') return clean(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return clean(record.name) || clean(record.alternateName)
  }
  return ''
}

function findAddress(value: unknown, found: ExtractedBusinessLocation[], depth = 0) {
  if (depth > 10 || found.length >= 20) return
  if (Array.isArray(value)) {
    for (const item of value) findAddress(item, found, depth + 1)
    return
  }
  if (!value || typeof value !== 'object') return

  const record = value as Record<string, unknown>
  const rawAddress = record.address
  const addresses = Array.isArray(rawAddress) ? rawAddress : [rawAddress]
  for (const address of addresses) {
    if (!address || typeof address !== 'object' || Array.isArray(address)) continue
    const postalAddress = address as Record<string, unknown>
    const city = clean(postalAddress.addressLocality)
    const country = schemaCountry(postalAddress.addressCountry)
    if (city || country) found.push({ city, country })
  }

  const city = clean(record.addressLocality)
  const country = schemaCountry(record.addressCountry)
  if (city || country) found.push({ city, country })

  for (const [key, nested] of Object.entries(record)) {
    if (key !== 'address') findAddress(nested, found, depth + 1)
  }
}

function metaValue(html: string, key: string, attribute: 'name' | 'property'): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([value]) => value)
    .find((value) => new RegExp(`\\b${attribute}\\s*=\\s*(["'])${escapedKey}\\1`, 'i').test(value))
  if (!tag) return ''
  return clean(tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2])
}

function microdataValue(html: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const item = [...html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<([a-z][\w:-]*)\b([^>]*)\/?>/gi)]
    .map((match) => ({
      attributes: match[2] || match[5] || '',
      content: match[3] || '',
    }))
    .find(({ attributes }) =>
      new RegExp(`\\bitemprop\\s*=\\s*(["'])${escapedKey}\\1`, 'i').test(attributes),
    )
  if (!item) return ''
  const content = item.attributes.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2]
  return clean(content || item.content.replace(/<[^>]*>/g, ' '))
}

export function extractBusinessLocation(sources: string[]): ExtractedBusinessLocation | null {
  const schemaLocations: ExtractedBusinessLocation[] = []
  for (const source of sources) {
    for (const match of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        findAddress(JSON.parse(match[1]), schemaLocations)
      } catch {
        continue
      }
    }
  }

  const schemaLocation = schemaLocations.find(({ city, country }) => city && country)
    ?? schemaLocations.find(({ city, country }) => city || country)
  if (schemaLocation) return schemaLocation

  for (const source of sources) {
    const city = metaValue(source, 'business:contact_data:locality', 'property') ||
      metaValue(source, 'geo.placename', 'name') ||
      microdataValue(source, 'addressLocality')
    const country = metaValue(source, 'business:contact_data:country_name', 'property') ||
      metaValue(source, 'geo.country', 'name') ||
      metaValue(source, 'geo.region', 'name').split('-')[0] ||
      microdataValue(source, 'addressCountry')
    if (city || country) return { city, country }
  }

  return null
}
