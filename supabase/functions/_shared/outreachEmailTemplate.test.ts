import { describe, expect, it } from 'vitest'
import { outreachEmailHtml, replyEmailHtml, sentEmailBody } from './outreachEmailTemplate'

describe('outreach email template', () => {
  it('formats the message in a responsive Arlotech-branded layout', () => {
    const html = outreachEmailHtml(
      'Hi Alex,\n\nA useful website observation.\n\nKind regards,\nArlotech',
      'Business address',
      'https://project.supabase.co/functions/v1/unsubscribe?token=signed',
    )

    expect(html).toContain('ARLOTECH')
    expect(html).toContain('max-width:560px')
    expect(html).toContain('<p ')
    expect(html).toContain('A useful website observation.')
    expect(html).toContain('Business address')
  })

  it('shows a visible logo on the dark branded header and preserves the attached-PDF copy', () => {
    const html = outreachEmailHtml(
      'Hi Alex,\n\nA useful website observation.\n\nWe’ve attached a concise PDF outlining our findings and recommendations.\n\nWould a conversation help?',
      'Business address',
      'https://project.supabase.co/functions/v1/unsubscribe?token=signed',
      true,
      'Chris Example',
    )

    expect(html).toContain('<img src="cid:arlotech-logo" width="36" height="36"')
    expect(html).toContain('background:#10243a')
    expect(html).toContain('color:#ffffff')
    expect(html).toContain('Sent by Chris Example')
    expect(html).not.toContain('width="44" height="44"')
    expect(html).not.toContain('width="190"')
    expect(html).toContain('DIGITAL SOLUTIONS')
    expect(html).toContain('background:#f5bf24')
    expect(html).toContain('We’ve attached a concise PDF outlining our findings and recommendations.')
    expect(html.indexOf('We’ve attached a concise PDF')).toBeGreaterThan(html.indexOf('A useful website observation.'))
    expect(html.indexOf('We’ve attached a concise PDF')).toBeLessThan(html.indexOf('Would a conversation help?'))
  })

  it('escapes the sender name in the branded header', () => {
    const html = outreachEmailHtml(
      'Hello',
      'Business address',
      'https://project.supabase.co/functions/v1/unsubscribe?token=signed',
      false,
      '<Chris>',
    )

    expect(html).toContain('Sent by &lt;Chris&gt;')
    expect(html).not.toContain('Sent by <Chris>')
  })

  it('escapes message markup and includes the unsubscribe link and address in both formats', () => {
    const message = 'Hello <script>alert("x")</script>'
    const unsubscribeUrl = 'https://project.supabase.co/functions/v1/unsubscribe?token=signed&source=email'
    const html = outreachEmailHtml(message, '1 Main & Second Street', unsubscribeUrl)
    const text = sentEmailBody(message, '1 Main & Second Street', unsubscribeUrl)

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('1 Main &amp; Second Street')
    expect(html).toContain('href="https://project.supabase.co/functions/v1/unsubscribe?token=signed&amp;source=email"')
    expect(html).toContain('background:#10243a;color:#ffffff;font:700 12px/1.2 Arial,Helvetica,sans-serif;text-decoration:none">Unsubscribe</a>')
    expect(html).not.toContain('reply to this email')
    expect(text).toContain(`Unsubscribe: ${unsubscribeUrl}`)
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
