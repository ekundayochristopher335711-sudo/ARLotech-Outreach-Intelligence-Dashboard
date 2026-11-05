import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CheckCircle, Clock, ChevronDown, ChevronUp, Mail, RefreshCw, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
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
  const activeOpenThreadId = openThreadId === undefined ? focusedThreadId : openThreadId
  const repliedMessages = allMessages.filter((message) => message.direction === 'inbound' || message.status === 'replied')
  const sentMessages = allMessages.filter((message) => message.direction === 'outbound' && message.status === 'sent')
  const prospectNames = new Map<string, string>(
    ((prospects || []) as Pick<Prospect, 'id' | 'business_name'>[]).map((prospect) => [prospect.id, prospect.business_name]),
  )

  const markThreadRead = markThreadReadMutation.mutate
  useEffect(() => {
    if (!focusedThreadId || !messages) return
    const unreadIds = allMessages
      .filter((message) => message.thread_id === focusedThreadId && message.direction === 'inbound' && !message.read_at)
      .map((message) => message.id)
    if (unreadIds.length) markThreadRead(unreadIds)
  }, [focusedThreadId, allMessages, messages, markThreadRead])

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

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{localStorage.getItem('arlotech-login-mode') === 'blacksite' ? 'EMAIL THREADS' : 'Email conversations'}</h2>
        {prospectsError && (
          <p className="mb-3 text-sm text-red-600">
            Could not load prospect names: {prospectsError instanceof Error ? prospectsError.message : 'Unknown error'}
          </p>
        )}
        {threads.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">No email conversations have been recorded yet.</p>
            <p className="mt-1 text-xs text-slate-400">Sent emails and replies will appear together here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => {
              const isOpen = activeOpenThreadId === thread.id
              const initialMessage = thread.messages.find((message) => message.direction === 'outbound') || thread.messages[0]
              const prospectName = initialMessage.prospect_id
                ? prospectNames.get(initialMessage.prospect_id) || 'Prospect'
                : 'Unlinked message'
              const threadDate = thread.latestMessage.received_at || thread.latestMessage.sent_at || thread.latestMessage.created_at
              return (
                <article id={`thread-${thread.id}`} key={thread.id} className={`overflow-hidden rounded-lg border ${thread.unreadCount ? 'border-amber-300' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      if (isOpen) {
                        setOpenThreadId(null)
                        return
                      }
                      setOpenThreadId(thread.id)
                      const unreadIds = thread.messages
                        .filter((message) => message.direction === 'inbound' && !message.read_at)
                        .map((message) => message.id)
                      if (unreadIds.length) markThreadReadMutation.mutate(unreadIds)
                    }}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-slate-800">{prospectName}</span>
                        {thread.unreadCount > 0 && <Badge variant="warning">{thread.unreadCount} unread</Badge>}
                        <span className="text-xs text-slate-400">{thread.messages.length} messages</span>
                      </span>
                      <span className="mt-1 block truncate text-sm font-medium text-slate-700">
                        {initialMessage.subject || '(No subject)'}
                      </span>
                      <span className="mt-1 block truncate text-xs text-slate-500">
                        {thread.latestMessage.direction === 'inbound' ? 'Received: ' : 'Sent: '}
                        {thread.latestMessage.body || '(No message content)'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-xs text-slate-400">
                        {threadDate ? format(new Date(threadDate), 'MMM d, yyyy HH:mm') : 'Date unavailable'}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4">
                      {thread.messages.map((message) => {
                        const reply = message.direction === 'inbound' ? splitReplyText(message.body || '') : null
                        const messageDate = message.received_at || message.sent_at || message.created_at
                        const sender = message.direction === 'inbound'
                          ? message.sender_email || prospectName
                          : 'You'
                        return (
                          <article
                            id={`message-${message.id}`}
                            key={message.id}
                            className={`rounded-lg border bg-white p-4 ${focusedMessageId === message.id ? 'border-arlotech ring-2 ring-arlotech/20' : 'border-slate-200'}`}
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={message.direction === 'inbound' ? 'warning' : 'success'}>
                                  {message.direction === 'inbound' ? 'Received' : 'Sent'}
                                </Badge>
                                {message.opened_at && <Badge variant="warning">Possible open</Badge>}
                                {message.direction === 'inbound' && !message.read_at && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Unread</span>
                                )}
                                <span className="text-xs text-slate-400">
                                  {messageDate ? format(new Date(messageDate), 'MMM d, yyyy HH:mm') : 'Date unavailable'}
                                </span>
                              </div>
                              <span className="break-all text-right text-sm font-medium text-slate-700">{sender}</span>
                            </div>
                            <h3 className="font-medium text-slate-800">{message.subject || '(No subject)'}</h3>
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
                              {reply?.readableText || message.body || '(No message content)'}
                            </p>
                            {reply?.quotedText && (
                              <details className="mt-3 text-xs text-slate-500">
                                <summary className="cursor-pointer select-none">Show quoted message</summary>
                                <p className="mt-2 whitespace-pre-wrap border-l-2 border-slate-200 pl-3">{reply.quotedText}</p>
                              </details>
                            )}
                            {message.direction === 'inbound' && (
                              <div className="mt-4 border-t border-slate-100 pt-3">
                                {replyingToId === message.id ? (
                                  <div className="space-y-3">
                                    <p className="break-all text-xs text-slate-500">
                                      To: {message.sender_email || 'Sender address unavailable'} · Subject: {/^re:/i.test(message.subject || '') ? message.subject : `Re: ${message.subject || 'your message'}`}
                                    </p>
                                    <label className="block">
                                      <span className="sr-only">Your reply</span>
                                      <textarea
                                        value={replyBody}
                                        onChange={(event) => setReplyBody(event.target.value)}
                                        rows={5}
                                        maxLength={12000}
                                        placeholder="Write your reply..."
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
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
                        )
                      })}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
