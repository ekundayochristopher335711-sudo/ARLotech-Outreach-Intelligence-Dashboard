import { describe, expect, it } from 'vitest'
import { calculateReplyRate } from './emailMetrics'

describe('email metrics', () => {
  it('counts one reply per conversation', () => {
    expect(calculateReplyRate([
      { direction: 'outbound', status: 'sent', thread_id: 'thread-a' },
      { direction: 'inbound', status: 'received', thread_id: 'thread-a' },
      { direction: 'inbound', status: 'received', thread_id: 'thread-a' },
      { direction: 'outbound', status: 'sent', thread_id: 'thread-b' },
    ])).toBe(50)
  })

  it('matches messages without thread IDs by prospect or email', () => {
    expect(calculateReplyRate([
      { direction: 'outbound', status: 'sent', prospect_id: 'prospect-a' },
      { direction: 'inbound', status: 'received', prospect_id: 'prospect-a' },
      { direction: 'outbound', status: 'sent', recipient_email: 'Other@Example.com' },
      { direction: 'inbound', status: 'received', sender_email: 'other@example.com' },
    ])).toBe(100)
  })

  it('ignores unrelated inbound messages', () => {
    expect(calculateReplyRate([
      { direction: 'outbound', status: 'sent', thread_id: 'thread-a' },
      { direction: 'inbound', status: 'received', thread_id: 'thread-other' },
    ])).toBe(0)
  })
})
