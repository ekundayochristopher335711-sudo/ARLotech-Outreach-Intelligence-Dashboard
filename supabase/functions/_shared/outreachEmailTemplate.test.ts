import { describe, expect, it } from 'vitest'
import { outreachEmailHtml, replyEmailHtml, sentEmailBody } from './outreachEmailTemplate'

describe('outreach email template', () => {
  it('formats the message in a responsive Arlotech-branded layout', () => {
    const html = outreachEmailHtml('Hi Alex,\n\nA useful website observation.\n\nKind regards,\nArlotech', 'Business address')

    expect(html).toContain('ARLOTECH')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('<p ')
    expect(html).toContain('A useful website observation.')
    expect(html).toContain('Business address')
  })

  it('embeds the logo and highlights the attached PDF in the middle of the message', () => {
    const html = outreachEmailHtml(
      'Hi Alex,\n\nA useful website observation.\n\nWe have attached a short website review with more detail. Please take a look.\n\nWould a conversation help?',
      'Business address',
      true,
    )

    expect(html).toContain('<img src="cid:arlotech-logo"')
    expect(html).toContain('Your website review PDF is attached')
    expect(html).toContain('website-review PDF attached to this email')
    expect(html.indexOf('Your website review PDF is attached')).toBeGreaterThan(html.indexOf('A useful website observation.'))
    expect(html.indexOf('Your website review PDF is attached')).toBeLessThan(html.indexOf('Would a conversation help?'))
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

  it('uses the Arlotech outreach design for replies and escapes reply content', () => {
    const html = replyEmailHtml('Thanks for getting back to us.\n\n<script>alert("unsafe")</script>')

    expect(html).toContain('ARLOTECH')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('Thanks for getting back to us.')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
