const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => octet < 0 || octet > 255)) return false
  const [first, second] = octets

  return first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0)
}

function ipv6Groups(hostname: string): number[] | null {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!value.includes(':')) return null

  let normalized = value
  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (ipv4Tail) {
    const octets = ipv4Tail[1].split('.').map(Number)
    if (octets.some((octet) => octet < 0 || octet > 255)) return null
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
    normalized = normalized.replace(ipv4Tail[1], replacement)
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [
    ...left,
    ...Array(halves.length === 2 ? missing : 0).fill('0'),
    ...right,
  ]
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

export function isPublicIpAddress(address: string) {
  const hostname = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (IPV4_PATTERN.test(hostname)) return !isPrivateIpv4(hostname)

  const groups = ipv6Groups(hostname)
  if (!groups) return false
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (isIpv4Mapped) {
    return !isPrivateIpv4(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`)
  }

  const first = groups[0]
  const second = groups[1]
  const isGlobalUnicast = (first & 0xe000) === 0x2000
  const isDocumentation = first === 0x2001 && second === 0x0db8
  const isTeredo = first === 0x2001 && second === 0
  return isGlobalUnicast && !isDocumentation && !isTeredo
}

export function assertSafeExternalUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only public HTTP and HTTPS website URLs are supported.')
  }
  if (url.username || url.password) throw new Error('Website URLs cannot include credentials.')

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata.google'
  ) {
    throw new Error('Private or local website destinations are not supported.')
  }

  if ((IPV4_PATTERN.test(hostname) || hostname.includes(':')) && !isPublicIpAddress(hostname)) {
    throw new Error('Private or reserved IP addresses are not supported.')
  }
}
