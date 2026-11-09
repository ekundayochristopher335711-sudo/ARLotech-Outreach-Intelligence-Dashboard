import { describe, expect, it } from 'vitest'
import { parseResendProviderEvent, verifyResendWebhookSignature } from './helpers'

const providerMessageId = '123e4567-e89b-42d3-a456-426614174000'

function emailEvent(type: string, data: Record<string, unknown> = {}) {
  return {
    type,
    created_at: '2026-11-02T10:00:00.000Z',
    data: {
      created_at: '2026-11-02T09:59:59.000Z',
      email_id: providerMessageId,
      to: [' Person@Example.com '],
      ...data,
    },
  }
}

describe('Resend provider webhook helpers', () => {
  it('accepts a valid signed event and rejects invalid signatures', async () => {
    const now = Date.parse('2026-11-02T10:00:00.000Z')
    const id = 'msg_test-123'
    const timestamp = String(now / 1000)
    const rawBody = JSON.stringify(emailEvent('email.delivered'))
    const keyBytes = new TextEncoder().encode('test-signing-key')
    const secret = `whsec_${btoa(String.fromCharCode(...keyBytes))}`
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)))
    const encoded = btoa(String.fromCharCode(...signature))
    const headers = { id, timestamp, signature: `v1,${encoded}` }

    await expect(verifyResendWebhookSignature(headers, rawBody, secret, now)).resolves.toBe(true)
    await expect(verifyResendWebhookSignature({ ...headers, signature: 'v1,invalid' }, rawBody, secret, now)).resolves.toBe(false)
    await expect(verifyResendWebhookSignature(headers, rawBody, 'missing-secret', now)).resolves.toBe(false)
  })

  it('rejects stale/replayed webhook timestamps', async () => {
    await expect(verifyResendWebhookSignature({
      id: 'msg_old',
      timestamp: '1762077000',
      signature: 'v1,signature',
    }, '{}', 'whsec_dGVzdA==', Date.parse('2026-11-02T10:00:00.000Z'))).resolves.toBe(false)
  })

  it('maps documented delivery, bounce, complaint, and failure events with normalized recipients', () => {
    for (const [type, status] of [
      ['email.sent', 'accepted'],
      ['email.delivered', 'delivered'],
      ['email.bounced', 'bounced'],
      ['email.complained', 'complained'],
      ['email.failed', 'failed'],
    ] as const) {
      const parsed = parseResendProviderEvent(emailEvent(type))
      expect(parsed?.eventStatus).toBe(status)
      expect(parsed?.recipientEmails).toEqual(['person@example.com'])
      expect(parsed?.providerMessageId).toBe(providerMessageId)
    }
  })

  it('validates provider suppression payloads without treating unknown events as unsubscribes', () => {
    const added = parseResendProviderEvent({
      type: 'suppression.added',
      created_at: '2026-11-02T10:00:00.000Z',
      data: { email: ' person@example.com ', origin: 'complaint', source_id: providerMessageId },
    })
    expect(added?.eventType).toBe('suppression.added')
    expect(added?.suppressionOrigin).toBe('complaint')
    const removed = parseResendProviderEvent({
      type: 'suppression.removed',
      created_at: '2026-11-02T10:00:00.000Z',
      data: { email: ' person@example.com ', origin: 'manual', source_id: null },
    })
    expect(removed?.eventType).toBe('suppression.removed')
    expect(removed?.recipientEmails).toEqual(['person@example.com'])
    expect(parseResendProviderEvent({ type: 'email.unsubscribed', data: {} })).toBeNull()
    expect(parseResendProviderEvent(emailEvent('email.delivered', { email_id: 'bad-id' }))).toBeNull()
    expect(parseResendProviderEvent(emailEvent('email.delivered', { to: ['not-an-email'] }))).toBeNull()
    expect(parseResendProviderEvent({ type: 'suppression.added', data: { email: 'bad', origin: 'unknown' } })).toBeNull()
  })
})