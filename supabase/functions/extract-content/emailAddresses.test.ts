import { describe, expect, it } from 'vitest'
import { extractEmailAddresses } from './emailAddresses'

describe('extractEmailAddresses', () => {
  it('extracts visible and mailto email addresses, including encoded attributes', () => {
    expect(extractEmailAddresses([
      'Contact info@acme.co.uk or <a href="mailto:sales%40acme.co.uk?subject=Hello">Email us</a>',
    ])).toEqual(['info@acme.co.uk', 'sales@acme.co.uk'])
  })

  it('decodes HTML entities in visible addresses', () => {
    expect(extractEmailAddresses(['Write to hello&commat;acme&period;co&period;uk'])).toEqual([
      'hello@acme.co.uk',
    ])
  })

  it('ignores malformed mailto links', () => {
    expect(extractEmailAddresses(['<a href="mailto:not-an-address">Contact</a>'])).toEqual([])
  })

  it('ignores form and template placeholder addresses', () => {
    expect(extractEmailAddresses([
      '<input placeholder="your@email.com"><p>hello@real-business.co.uk</p>',
      'Template values: name@example.com and user@domain.com',
    ])).toEqual(['hello@real-business.co.uk'])
  })

  it('ignores arbitrary inline-script addresses while keeping structured email fields', () => {
    expect(extractEmailAddresses([
      '<script>const stale = "wrong@old-domain.co.uk"</script>' +
        '<script type="application/ld+json">{"@type":"Organization","email":"info@acme.co.uk"}</script>',
    ])).toEqual(['info@acme.co.uk'])
  })
})
