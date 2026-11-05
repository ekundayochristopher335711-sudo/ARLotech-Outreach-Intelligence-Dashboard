import type { EmailMessage } from '@/types'

export type ThreadMessage = Pick<
  EmailMessage,
  'id' | 'thread_id' | 'prospect_id' | 'direction' | 'read_at' | 'sent_at' | 'received_at' | 'created_at'
>

export interface EmailThread<TMessage extends ThreadMessage = ThreadMessage> {
  id: string
  messages: TMessage[]
  latestMessage: TMessage
  unreadCount: number
}

function messageTimestamp(message: ThreadMessage) {
  const timestamp = message.received_at || message.sent_at || message.created_at
  return timestamp ? Date.parse(timestamp) : 0
}

export function groupEmailThreads<TMessage extends ThreadMessage>(messages: TMessage[]): EmailThread<TMessage>[] {
  const grouped = new Map<string, TMessage[]>()
  const seenMessageIds = new Set<string>()
  for (const message of messages) {
    if (seenMessageIds.has(message.id)) continue
    seenMessageIds.add(message.id)
    const threadId = message.thread_id || message.prospect_id || message.id
    const thread = grouped.get(threadId)
    if (thread) thread.push(message)
    else grouped.set(threadId, [message])
  }

  return Array.from(grouped, ([id, threadMessages]) => {
    threadMessages.sort((left, right) => messageTimestamp(left) - messageTimestamp(right))
    const latestMessage = threadMessages[threadMessages.length - 1]
    return {
      id,
      messages: threadMessages,
      latestMessage,
      unreadCount: threadMessages.filter((message) => message.direction === 'inbound' && !message.read_at).length,
    }
  }).sort((left, right) => messageTimestamp(right.latestMessage) - messageTimestamp(left.latestMessage))
}
