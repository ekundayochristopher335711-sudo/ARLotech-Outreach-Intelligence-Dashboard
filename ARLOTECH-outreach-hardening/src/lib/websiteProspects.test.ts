import { describe, expect, it } from 'vitest'
import { normalizeWebsiteDomain, suggestProspectNameFromWebsite } from './websiteDomain'

describe('website-to-prospect helpers', () => {
  it('normalizes http and www variants to the same domain', () => {
    expect(normalizeWebsiteDomain('http://www.example.com/services')).toBe('example.com')
    expect(normalizeWebsiteDomain('https://example.com/')).toBe('example.com')
  })

  it('creates a readable but unverified prospect name from the hostname', () => {
    expect(suggestProspectNameFromWebsite('https://www.norwich-plumbing.co.uk')).toBe('Norwich Plumbing')
  })

  it('rejects invalid URLs and URLs containing credentials', () => {
    expect(() => normalizeWebsiteDomain('not a valid url')).toThrow()
    expect(() => normalizeWebsiteDomain('https://user:password@example.com')).toThrow('Enter a valid website URL.')
  })
})
