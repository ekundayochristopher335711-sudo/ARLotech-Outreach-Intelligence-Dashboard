import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Mail, Clock, CheckCircle } from 'lucide-react'

export function RepliesPage() {
  const {
    data: messages,
    isLoading,
  } = useQuery({
    queryKey: ['/email-messages'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <Card className="p-6">
          <div className="h-40 animate-pulse rounded bg-slate-200" />
        </Card>
      </div>
    )
  }

  const repliedMessages = messages?.filter((m: { status: string }) => m.status === 'replied') || []
  const sentMessages = messages?.filter((m: { status: string }) => m.status === 'sent') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Replies</h1>
          <p className="text-sm text-slate-500 mt-1">Track and manage replied conversations</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <Mail className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{repliedMessages.length}</p>
              <p className="text-sm text-slate-500">Replied</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{sentMessages.length}</p>
              <p className="text-sm text-slate-500">Sent</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{messages?.length ?? 0}</p>
              <p className="text-sm text-slate-500">Total</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Recent Replies</h2>
          <div className="flex gap-2">
            <button type="button" className="text-xs text-slate-500 hover:text-slate-700">
              View all
            </button>
          </div>
        </div>

        {repliedMessages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-500">No replies yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Start sending outreach emails to get replies
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {repliedMessages.map((msg: { id: string; status: string; received_at: string | null; subject: string; body: string }) => (
              <div
                key={msg.id}
                className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{msg.status}</Badge>
                    <span className="text-xs text-slate-400">
                      {msg.received_at
                        ? format(new Date(msg.received_at), 'MMM d, yyyy HH:mm')
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 truncate max-w-[150px]">
                      {msg.subject}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2">{msg.body.substring(0, 100)}...</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
