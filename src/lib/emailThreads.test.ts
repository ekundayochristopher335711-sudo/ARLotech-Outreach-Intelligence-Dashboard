import { describe, expect, it } from 'vitest'
import { groupEmailThreads, type ThreadMessage } from './emailThreads'

function message(overrides: Partial<ThreadMessage> & Pick<ThreadMessage, 'id'>): ThreadMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id ?? 'thread-1',
    prospect_id: overrides.prospect_id ?? 'prospect-1',
    direction: overrides.direction ?? 'outbound',
    read_at: overrides.read_at ?? null,
    sent_at: overrides.sent_at ?? null,
    received_at: overrides.received_at ?? null,
    created_at: overrides.created_at ?? '2026-11-05T10:00:00Z',
  }
}

describe('groupEmailThreads', () => {
  it('keeps follow-ups and received replies under the original sent message thread', () => {
    const threads = groupEmailThreads([
      message({ id: 'reply-1', direction: 'inbound', received_at: '2026-11-05T12:00:00Z' }),
      message({ id: 'follow-up', sent_at: '2026-11-05T11:00:00Z' }),
      message({ id: 'original', sent_at: '2026-11-05T10:00:00Z' }),
    ])

    expect(threads).toHaveLength(1)
    expect(threads[0].messages.map(({ id }) => id)).toEqual(['original', 'follow-up', 'reply-1'])
    expect(threads[0].unreadCount).toBe(1)
  })

  it('keeps distinct thread ids separate and excludes read inbound messages from unread totals', () => {
    const threads = groupEmailThreads([
      message({ id: 'unread', direction: 'inbound' }),
      message({ id: 'read', thread_id: 'thread-2', direction: 'inbound', read_at: '2026-11-05T12:00:00Z' }),
    ])

    expect(threads.map(({ id, unreadCount }) => [id, unreadCount])).toEqual([
      ['thread-1', 1],
      ['thread-2', 0],
    ])
  })
})
