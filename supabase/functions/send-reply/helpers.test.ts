import { describe, expect, it } from 'vitest'
import { createReplyIdempotencyKey } from './helpers'

describe('reply idempotency keys', () => {
  it('is stable for the same reply request', async () => {
    const first = await createReplyIdempotencyKey('user-a', 'message-a', 'Thanks for getting back to us.')
    const second = await createReplyIdempotencyKey('user-a', 'message-a', 'Thanks for getting back to us.')
    expect(first).toBe(second)
  })

  it('changes when the reply content changes', async () => {
    const first = await createReplyIdempotencyKey('user-a', 'message-a', 'First reply')
    const second = await createReplyIdempotencyKey('user-a', 'message-a', 'Second reply')
    expect(first).not.toBe(second)
  })
})
