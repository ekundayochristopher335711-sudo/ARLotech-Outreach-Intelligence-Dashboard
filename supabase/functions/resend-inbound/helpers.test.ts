import { describe, expect, it } from 'vitest'
import {
  htmlToText,
  isTrustedPushEndpoint,
  normalizedEmail,
  notificationContent,
  trackedEmailEventType,
} from './helpers'

describe('inbound reply normalization', () => {
  it('normalizes and validates sender email addresses', () => {
    expect(normalizedEmail('  Reply@Example.com ')).toBe('reply@example.com')
    expect(normalizedEmail('JBF Plumbing <Reply@Example.com>')).toBe('reply@example.com')
    expect(normalizedEmail('not an email')).toBeNull()
    expect(normalizedEmail('x'.repeat(250) + '@example.com')).toBeNull()
  })

  it('converts HTML bodies into readable text without script content', () => {
    expect(htmlToText('<p>Hello &amp; welcome</p><script>secret()</script><p>Thanks</p>'))
      .toBe('Hello & welcome\nThanks')
  })

  it('creates idempotent, cautious notifications for opens and replies', () => {
    expect(trackedEmailEventType('email.opened')).toBe('email.opened')
    expect(trackedEmailEventType('email.received')).toBe('email.received')
    expect(trackedEmailEventType('email.delivered')).toBeNull()
    expect(notificationContent('email.opened', 'resend-id', 'A quick note')).toEqual({
      source_key: 'resend:email.opened:resend-id',
      title: 'Possible email open',
      body: 'Resend recorded a possible open for "A quick note". Email privacy tools can trigger opens automatically.',
    })
    expect(notificationContent('email.received', 'reply-id', 'Re: Hello', 'client@example.com')).toEqual({
      source_key: 'resend:email.received:reply-id',
      title: 'New reply received',
      body: 'client@example.com replied: Re: Hello',
    })
  })

  it('accepts known browser push services and rejects untrusted subscription URLs', () => {
    expect(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/token')).toBe(true)
    expect(isTrustedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/token')).toBe(true)
    expect(isTrustedPushEndpoint('https://web.push.apple.com/push/token')).toBe(true)
    expect(isTrustedPushEndpoint('https://wns2.notify.windows.com/token')).toBe(true)
    expect(isTrustedPushEndpoint('https://localhost/push')).toBe(false)
    expect(isTrustedPushEndpoint('https://fcm.googleapis.com.evil.example/push')).toBe(false)
    expect(isTrustedPushEndpoint('http://fcm.googleapis.com/push')).toBe(false)
  })
})
