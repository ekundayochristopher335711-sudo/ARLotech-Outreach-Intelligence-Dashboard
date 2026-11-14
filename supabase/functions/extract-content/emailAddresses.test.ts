import { describe, expect, it } from 'vitest'
import { extractEmailAddresses } from './emailAddresses'

describe('extractEmailAddresses', () => {
  it('extracts visible and mailto email addresses, including encoded attributes', () => {
    expect(extractEmailAddresses([
      'Contact info@example.com or <a href="mailto:sales%40example.com?subject=Hello">Email us</a>',
    ])).toEqual(['info@example.com', 'sales@example.com'])
  })

  it('decodes HTML entities in visible addresses', () => {
    expect(extractEmailAddresses(['Write to hello&commat;example&period;com'])).toEqual([
      'hello@example.com',
    ])
  })

  it('ignores malformed mailto links', () => {
    expect(extractEmailAddresses(['<a href="mailto:not-an-address">Contact</a>'])).toEqual([])
  })
})
