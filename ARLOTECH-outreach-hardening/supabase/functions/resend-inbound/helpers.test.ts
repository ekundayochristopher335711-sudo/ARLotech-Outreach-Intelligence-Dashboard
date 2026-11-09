import { describe, expect, it } from 'vitest'
import { htmlToText, normalizedEmail } from './helpers'

describe('inbound reply normalization', () => {
  it('normalizes and validates sender email addresses', () => {
    expect(normalizedEmail('  Reply@Example.com ')).toBe('reply@example.com')
    expect(normalizedEmail('not an email')).toBeNull()
    expect(normalizedEmail('x'.repeat(250) + '@example.com')).toBeNull()
  })

  it('converts HTML bodies into readable text without script content', () => {
    expect(htmlToText('<p>Hello &amp; welcome</p><script>secret()</script><p>Thanks</p>'))
      .toBe('Hello & welcome\nThanks')
  })
})
