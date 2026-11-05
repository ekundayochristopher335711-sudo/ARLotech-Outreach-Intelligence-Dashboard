import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CheckCircle, Clock, Inbox, Mail, RefreshCw, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { exportRepliesPdf } from '@/lib/exportPdf'
import { groupEmailThreads } from '@/lib/emailThreads'
import { splitReplyText } from '@/lib/replyText'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import type { EmailMessage, Prospect } from '@/types'

type ReplyMessage = Pick<
  EmailMessage,
  'id' | 'direction' | 'status' | 'received_at' | 'sent_at' | 'created_at' | 'subject' | 'body' | 'prospect_id' | 'recipient_email' | 'sender_email' | 'opened_at'
  | 'thread_id' | 'read_at'
>

export function RepliesPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const focusedMessageId = searchParams.get('messageId')
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [openThreadId, setOpenThreadId] = useState<string | null | undefined>(undefined)
  const {
    data: messages,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['/email-messages', focusedMessageId],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const projection = 'id, direction, status, received_at, sent_at, created_at, subject, body, prospect_id, recipient_email, sender_email, opened_at, thread_id, read_at'
      const { data, error } = await supabase
        .from('email_messages')
        .select(projection)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      let recentMessages = data as ReplyMessage[]
      const knownIds = new Set(recentMessages.map((message) => message.id))
      const rootIds = [...new Set(recentMessages.map((message) => message.thread_id).filter((id): id is string => !!id))]
        .filter((id) => !knownIds.has(id))
      if (rootIds.length) {
        const { data: rootMessages, error: rootMessagesError } = await supabase
          .from('email_messages')
          .select(projection)
          .eq('user_id', userId)
          .in('id', rootIds)
        if (rootMessagesError) throw rootMessagesError
        recentMessages = [...(rootMessages as ReplyMessage[]), ...recentMessages]
      }
      if (!focusedMessageId || recentMessages.some((message) => message.id === focusedMessageId)) return recentMessages

      const { data: focusedMessage, error: focusedMessageError } = await supabase
        .from('email_messages')
        .select(projection)
        .eq('user_id', userId)
        .eq('id', focusedMessageId)
        .maybeSingle()
      if (focusedMessageError) throw focusedMessageError
      return focusedMessage ? [focusedMessage as ReplyMessage, ...recentMessages] : recentMessages
    },
  })

  const { data: prospects = [], error: prospectsError } = useQuery({
    queryKey: ['/prospects', 'reply-names'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('prospects')
        .select('id, business_name')
        .eq('user_id', userId)
      if (error) throw error
      return data as Pick<Prospect, 'id' | 'business_name'>[]
    },
  })

  const markThreadReadMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (!messageIds.length) return
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('email_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('direction', 'inbound')
        .is('read_at', null)
        .in('id', messageIds)
      if (error) throw error
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/email-messages'] }),
    onError: (markError: Error) => toast.error(markError.message || 'Could not mark this thread as read.'),
  })

  const allMessages = (messages || []) as ReplyMessage[]
  const threads = groupEmailThreads(allMessages)
  const focusedMessage = allMessages.find((message) => message.id === focusedMessageId)
  const focusedThreadId = focusedMessage
    ? focusedMessage.thread_id || focusedMessage.prospect_id || focusedMessage.id
    : null
  const activeOpenThreadId = openThreadId === undefined ? focusedThreadId || threads[0]?.id || null : openThreadId
  const selectedThread = threads.find((thread) => thread.id === activeOpenThreadId) || null
  const repliedMessages = allMessages.filter((message) => message.direction === 'inbound' || message.status === 'replied')
  const sentMessages = allMessages.filter((message) => message.direction === 'outbound' && message.status === 'sent')
  const prospectNames = new Map<string, string>(
    ((prospects || []) as Pick<Prospect, 'id' | 'business_name'>[]).map((prospect) => [prospect.id, prospect.business_name]),
  )

  const markThreadRead = markThreadReadMutation.mutate
  useEffect(() => {
    if (!activeOpenThreadId || !messages) return
    const unreadIds = (messages as ReplyMessage[])
      .filter((message) => (message.thread_id || message.prospect_id || message.id) === activeOpenThreadId
        && message.direction === 'inbound'
        && !message.read_at)
      .map((message) => message.id)
    if (unreadIds.length) markThreadRead(unreadIds)
  }, [activeOpenThreadId, messages, markThreadRead])

  useEffect(() => {
    if (!focusedMessageId || !activeOpenThreadId || !messages) return
    document.getElementById(`message-${focusedMessageId}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    })
  }, [focusedMessageId, messages, activeOpenThreadId])

  const sendReplyMutation = useMutation({
    mutationFn: async (input: { messageId: string; body: string }) => {
      const functionClient = supabase as typeof supabase & {
        functions: {
          invoke: (name: string, options: { body: unknown }) => Promise<{ data: unknown; error: Error | null }>
        }
      }
      const { data, error } = await functionClient.functions.invoke('send-reply', {
        body: { messageId: input.messageId, body: input.body },
      })
      if (error) {
        const detail = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : error.message
        throw new Error(detail || 'Could not send this reply.')
      }
      if (!data || typeof data !== 'object' || !('sent' in data) || data.sent !== true) {
        const detail = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'The reply service returned an invalid response.'
        throw new Error(detail)
      }
      return data as { sent: true; tracking_error?: string }
    },
    onSuccess: (result: { sent: true; tracking_error?: string }) => {
      setReplyingToId(null)
      setReplyBody('')
      void queryClient.invalidateQueries({ queryKey: ['/email-messages'] })
      toast.success(result.tracking_error
        ? `Reply sent. Message history warning: ${result.tracking_error}`
        : 'Reply sent.')
    },
    onError: (sendError: Error) => toast.error(sendError.message || 'Could not send reply.'),
  })

  if (isLoading) {
    return <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load replies: {error.message}</p>
  }

  const selectedInitialMessage = selectedThread?.messages.find((message) => message.direction === 'outbound')
    || selectedThread?.messages[0]
  const selectedProspectName = selectedInitialMessage?.prospect_id
    ? prospectNames.get(selectedInitialMessage.prospect_id) || 'Prospect'
    : selectedInitialMessage?.sender_email || selectedInitialMessage?.recipient_email || 'Unlinked conversation'
  const selectedSubject = selectedInitialMessage?.subject || '(No subject)'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'SIGNAL INTERCEPTS' : 'Replies'}</h1>
          <p className="mt-1 text-sm text-slate-500">Review inbound messages recorded in your outreach activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`mr-2 inline h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void exportRepliesPdf(repliedMessages, prospectNames)
              .then(() => toast.success('Replies exported as PDF'))
              .catch((exportError: unknown) =>
                toast.error(exportError instanceof Error ? exportError.message : 'Could not export replies as PDF.'),
              )}
            disabled={repliedMessages.length === 0}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mail className="mr-2 inline h-4 w-4" /> Export Replies
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600"><CheckCircle className="h-5 w-5" /></div>
            <div><p className="text-2xl font-bold text-slate-800">{repliedMessages.length}</p><p className="text-sm text-slate-500">Replies</p></div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600"><Mail className="h-5 w-5" /></div>
            <div><p className="text-2xl font-bold text-slate-800">{sentMessages.length}</p><p className="text-sm text-slate-500">Sent messages</p></div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-5 w-5" /></div>
            <div><p className="text-2xl font-bold text-slate-800">{allMessages.length}</p><p className="text-sm text-slate-500">Messages in latest 100</p></div>
          </div>
        </Card>
      </div>

      {repliedMessages.length === 0 && (
        <Card className="border-amber-200 bg-amber-50/60 p-5">
          <h2 className="text-base font-semibold text-slate-800">Replies are not showing up?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Incoming replies need a working reply address and Resend Receiving setup. Check these items:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>
              Set <code className="rounded bg-white px-1 py-0.5 text-xs">OUTREACH_REPLY_TO_EMAIL</code> in
              your Supabase function secrets to an address that can receive mail.
            </li>
            <li>
              In Resend Receiving, configure that address’s domain with the DNS records Resend provides.
              Use a dedicated subdomain if your current email provider already handles the main domain.
            </li>
            <li>
              Configure the Resend <code className="rounded bg-white px-1 py-0.5 text-xs">email.received</code> webhook
              to the <code className="rounded bg-white px-1 py-0.5 text-xs">resend-inbound</code> Supabase function,
              then set its signing secret and deploy the function.
            </li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            These settings apply to new emails. Replies to earlier emails still go to the address shown in those messages.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {prospectsError && (
          <p className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            Could not load prospect names: {prospectsError instanceof Error ? prospectsError.message : 'Unknown error'}
          </p>
        )}
        {threads.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="font-medium text-slate-700">Your inbox is clear</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Sent emails and prospect replies will appear together here.</p>
          </div>
        ) : (
          <div className="replies-inbox grid min-h-[580px] grid-cols-1 md:grid-cols-[minmax(245px,0.36fr)_minmax(0,0.64fr)]">
            <nav aria-label="Email conversations" className="border-b border-slate-200 bg-white md:border-b-0 md:border-r">
              <div className="border-b border-slate-100 px-4 py-4">
                <h2 className="text-base font-semibold text-slate-900">Inbox</h2>
                <p className="mt-1 text-xs text-slate-500">Your sent emails and replies, together</p>
              </div>
              <div className="max-h-[360px] overflow-y-auto md:max-h-[620px]">
                {threads.map((thread) => {
                  const isSelected = activeOpenThreadId === thread.id
                  const firstMessage = thread.messages.find((message) => message.direction === 'outbound') || thread.messages[0]
                  const name = firstMessage.prospect_id
                    ? prospectNames.get(firstMessage.prospect_id) || 'Prospect'
                    : firstMessage.direction === 'inbound'
                      ? firstMessage.sender_email || 'Unknown sender'
                      : firstMessage.recipient_email || 'Unknown recipient'
                  const timestamp = thread.latestMessage.received_at || thread.latestMessage.sent_at || thread.latestMessage.created_at
                  return (
                    <button
                      type="button"
                      key={thread.id}
                      aria-pressed={isSelected}
                      onClick={() => setOpenThreadId(thread.id)}
                      className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition-colors hover:bg-slate-50 ${isSelected ? 'bg-emerald-50/70 md:border-l-2 md:border-l-arlotech' : ''}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'P'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${thread.unreadCount ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{name}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {timestamp ? format(new Date(timestamp), 'MMM d') : ''}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{firstMessage.subject || '(No subject)'}</span>
                        <span className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                          <span>{thread.messages.length} {thread.messages.length === 1 ? 'message' : 'messages'}</span>
                          {thread.latestMessage.direction === 'inbound' && <span>· Latest from prospect</span>}
                          {thread.unreadCount > 0 && (
                            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                              {thread.unreadCount} unread
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </nav>

            {selectedThread && selectedInitialMessage ? (
              <section aria-label={`Conversation with ${selectedProspectName}`} className="flex min-h-[500px] min-w-0 flex-col bg-slate-50/70">
                <header className="border-b border-slate-200 bg-white px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-arlotech/10 text-sm font-semibold text-arlotech">
                      {selectedProspectName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'P'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-slate-900">{selectedProspectName}</h2>
                      <p className="truncate text-xs text-slate-500">{selectedSubject}</p>
                    </div>
                    <span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 sm:inline-flex">
                      {selectedThread.messages.length} {selectedThread.messages.length === 1 ? 'message' : 'messages'}
                    </span>
                  </div>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
                  {selectedThread.messages.map((message) => {
                    const isOutbound = message.direction === 'outbound'
                    const reply = isOutbound ? null : splitReplyText(message.body || '')
                    const messageDate = message.received_at || message.sent_at || message.created_at
                    const sender = isOutbound ? 'You' : message.sender_email || selectedProspectName
                    const address = isOutbound ? message.recipient_email : message.sender_email
                    return (
                      <div
                        id={`message-${message.id}`}
                        key={message.id}
                        className={`flex w-full ${isOutbound ? 'justify-start' : 'justify-end'}`}
                      >
                        <article className={`w-fit max-w-[88%] min-w-[min(60%,280px)] rounded-2xl border px-4 py-3 shadow-sm sm:max-w-[78%] ${isOutbound ? 'rounded-tl-md border-slate-200 bg-white' : 'rounded-tr-md border-emerald-200 bg-emerald-50/80'} ${focusedMessageId === message.id ? 'ring-2 ring-arlotech/30' : ''}`}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                            <span className={`text-xs font-semibold ${isOutbound ? 'text-slate-700' : 'text-emerald-800'}`}>
                              {sender} <span className="font-normal opacity-70">· {isOutbound ? 'Sent' : 'Received'}</span>
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {messageDate ? format(new Date(messageDate), 'MMM d, yyyy · HH:mm') : 'Date unavailable'}
                            </span>
                          </div>
                          {address && <p className="mb-2 break-all text-[11px] text-slate-400">{address}</p>}
                          {message.opened_at && (
                            <p className="mb-2 text-[11px] text-slate-500">
                              Possible open · {format(new Date(message.opened_at), 'MMM d, yyyy HH:mm')}
                            </p>
                          )}
                          {message.direction === 'inbound' && !message.read_at && (
                            <p className="mb-2 text-[11px] font-semibold text-amber-700">Unread</p>
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                            {reply?.readableText || message.body || '(No message content)'}
                          </p>
                          {reply?.quotedText && (
                            <details className="mt-3 border-t border-slate-200/70 pt-2 text-xs text-slate-500">
                              <summary className="cursor-pointer select-none">Show quoted email</summary>
                              <p className="mt-2 whitespace-pre-wrap border-l-2 border-slate-300 pl-3">{reply.quotedText}</p>
                            </details>
                          )}
                          {message.direction === 'inbound' && (
                            <div className="mt-3 border-t border-slate-200/70 pt-3">
                              {replyingToId === message.id ? (
                                <div className="space-y-3">
                                  <p className="break-all text-xs text-slate-500">
                                    To: {message.sender_email || 'Sender address unavailable'} · Re: {selectedSubject}
                                  </p>
                                  <label className="block">
                                    <span className="sr-only">Your reply</span>
                                    <textarea
                                      value={replyBody}
                                      onChange={(event) => setReplyBody(event.target.value)}
                                      rows={4}
                                      maxLength={12000}
                                      placeholder="Write your reply..."
                                      className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                                    />
                                  </label>
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <Button
                                      variant="secondary"
                                      onClick={() => {
                                        setReplyingToId(null)
                                        setReplyBody('')
                                      }}
                                      disabled={sendReplyMutation.isPending}
                                    >
                                      <X className="h-4 w-4" /> Cancel
                                    </Button>
                                    <Button
                                      onClick={() => sendReplyMutation.mutate({ messageId: message.id, body: replyBody.trim() })}
                                      disabled={sendReplyMutation.isPending || !message.sender_email || !replyBody.trim()}
                                    >
                                      <Send className="h-4 w-4" />
                                      {sendReplyMutation.isPending ? 'Sending...' : 'Send reply'}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setReplyingToId(message.id)
                                    setReplyBody('')
                                  }}
                                  disabled={!message.sender_email}
                                >
                                  <Send className="h-4 w-4" />
                                  {message.sender_email ? 'Reply' : 'Cannot reply: sender address missing'}
                                </Button>
                              )}
                            </div>
                          )}
                        </article>
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center p-8 text-center text-sm text-slate-500">
                Select a conversation to view its messages.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
