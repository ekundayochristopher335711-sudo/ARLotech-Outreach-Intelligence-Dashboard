import { describe, expect, it } from 'vitest'
import { outreachEmailHtml, sentEmailBody } from './outreachEmailTemplate'

describe('outreach email template', () => {
  it('formats the message in a responsive Arlotech-branded layout', () => {
    const html = outreachEmailHtml('Hi Alex,\n\nA useful website observation.\n\nKind regards,\nArlotech', 'Business address')

    expect(html).toContain('ARLOTECH')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('<p ')
    expect(html).toContain('A useful website observation.')
    expect(html).toContain('Business address')
  })

  it('escapes message markup and keeps the opt-out and address in both formats', () => {
    const message = 'Hello <script>alert("x")</script>'
    const html = outreachEmailHtml(message, '1 Main & Second Street')
    const text = sentEmailBody(message, '1 Main & Second Street')

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('1 Main &amp; Second Street')
    expect(html).toContain('reply to this email and let us know')
    expect(text).toContain('reply to this email and let us know')
    expect(text).toContain('1 Main & Second Street')
  })
})
