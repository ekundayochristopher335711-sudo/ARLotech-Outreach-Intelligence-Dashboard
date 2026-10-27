import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CheckCircle, Clock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { exportRepliesPdf } from '@/lib/exportPdf'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import type { EmailMessage, Prospect } from '@/types'

type ReplyMessage = Pick<EmailMessage, 'id' | 'direction' | 'status' | 'received_at' | 'sent_at' | 'created_at' | 'subject' | 'body' | 'prospect_id'>

export function RepliesPage() {
  const {
    data: messages,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/email-messages'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('email_messages')
        .select('id, direction, status, received_at, sent_at, created_at, subject, body, prospect_id')
        .eq('user_id', userId)
        .order('received_at', { ascending: false, nullsFirst: false })
        .limit(100)
      if (error) throw error
      return data as ReplyMessage[]
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

  if (isLoading) {
    return <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load replies: {error.message}</p>
  }

  const allMessages = (messages || []) as ReplyMessage[]
  const repliedMessages = allMessages.filter((message) => message.direction === 'inbound' || message.status === 'replied')
  const sentMessages = allMessages.filter((message) => message.direction === 'outbound' && message.status === 'sent')
  const prospectNames = new Map<string, string>(
    ((prospects || []) as Pick<Prospect, 'id' | 'business_name'>[]).map((prospect) => [prospect.id, prospect.business_name]),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Replies</h1>
          <p className="mt-1 text-sm text-slate-500">Review inbound messages recorded in your outreach activity.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            exportRepliesPdf(repliedMessages, prospectNames)
            toast.success('Replies exported as PDF')
          }}
          disabled={repliedMessages.length === 0}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mail className="mr-2 inline h-4 w-4" /> Export Replies
        </button>
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

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Latest Replies</h2>
        {prospectsError && (
          <p className="mb-3 text-sm text-red-600">
            Could not load prospect names: {prospectsError instanceof Error ? prospectsError.message : 'Unknown error'}
          </p>
        )}
        {repliedMessages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">No replies have been recorded yet.</p>
            <p className="mt-1 text-xs text-slate-400">Replies will appear here when inbound messages are added to your email activity.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {repliedMessages.map((message) => (
              <article key={message.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{message.direction === 'inbound' ? 'Received' : 'Replied'}</Badge>
                    <span className="text-xs text-slate-400">
                      {message.received_at
                        ? format(new Date(message.received_at), 'MMM d, yyyy HH:mm')
                        : message.created_at
                          ? format(new Date(message.created_at), 'MMM d, yyyy HH:mm')
                          : 'Date unavailable'}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">
                    {message.prospect_id ? prospectNames.get(message.prospect_id) || 'Prospect' : 'Unlinked message'}
                  </span>
                </div>
                <h3 className="font-medium text-slate-800">{message.subject || '(No subject)'}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{message.body || '(No message content)'}</p>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
