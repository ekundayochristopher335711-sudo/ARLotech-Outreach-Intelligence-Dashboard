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
      'Hi Alex,\n\nWebsite review snapshot\nFinding: A useful website observation.\nWhy it matters: Visitors may miss useful information.\n\nWould a conversation help?\n\nWe’ve attached a concise PDF outlining our findings and recommendations.',
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
    expect(html).toContain('Website review snapshot')
    expect(html).toContain('<strong>Finding:</strong> A useful website observation.')
    expect(html).toContain('<strong>Why it matters:</strong> Visitors may miss useful information.')
    expect(html.indexOf('Would a conversation help?')).toBeLessThan(html.indexOf('We’ve attached a concise PDF'))
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

  it('escapes text in the inline website review snapshot', () => {
    const html = outreachEmailHtml(
      'Website review snapshot\nFinding: <script>unsafe</script>\nWhy it matters: <img src=x onerror=alert(1)>',
      'Business address',
      'https://project.supabase.co/functions/v1/unsubscribe?token=signed',
    )

    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<script>unsafe</script>')
    expect(html).not.toContain('<img src=x')
  })

  it('uses the Arlotech outreach design for replies and escapes reply content', () => {
    const html = replyEmailHtml('Thanks for getting back to us.\n\n<script>alert("unsafe")</script>', true)

    expect(html).toContain('ARLOTECH')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('<img src="cid:arlotech-logo" width="36" height="36"')
    expect(html).toContain('Thanks for getting back to us.')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
