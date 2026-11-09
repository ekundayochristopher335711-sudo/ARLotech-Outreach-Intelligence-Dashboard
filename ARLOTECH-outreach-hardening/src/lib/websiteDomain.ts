export function normalizeWebsiteDomain(value: string) {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  const url = new URL(candidate)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Enter a valid website URL.')
  }
  return url.hostname.toLowerCase().replace(/^www\./, '')
}

export function suggestProspectNameFromWebsite(value: string) {
  const domain = normalizeWebsiteDomain(value)
  const firstLabel = domain.split('.')[0]
  const readableName = firstLabel
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return readableName.replace(/\b\w/g, (letter) => letter.toUpperCase()) || domain
}
