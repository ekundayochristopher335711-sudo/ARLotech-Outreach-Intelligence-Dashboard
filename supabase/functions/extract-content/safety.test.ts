import { describe, expect, it } from 'vitest'
import { assertSafeExternalUrl, isPublicIpAddress } from './safety'

describe('website destination safeguards', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejects private or reserved address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false)
  })

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public address %s',
    (address) => expect(isPublicIpAddress(address)).toBe(true),
  )

  it.each(['http://localhost', 'http://127.0.0.1', 'http://169.254.169.254', 'file:///etc/passwd'])(
    'rejects unsafe URL %s',
    (value) => expect(() => assertSafeExternalUrl(new URL(value))).toThrow(),
  )

  it('allows a public HTTPS website', () => {
    expect(() => assertSafeExternalUrl(new URL('https://example.com'))).not.toThrow()
  })
})
