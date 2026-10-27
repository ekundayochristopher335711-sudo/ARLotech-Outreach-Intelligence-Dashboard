import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { BarChart3, Mail, MessageCircle, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getCurrentUserId, supabase } from '@/lib/supabase'

interface DailyActivity {
  date: string
  sent: number
  replies: number
}

function daysAgo(days: number, from = new Date()) {
  const date = new Date(from)
  date.setDate(date.getDate() - days)
  return date
}

export function AnalyticsDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/analytics'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const now = new Date()
      const chartStart = daysAgo(13, now)
      chartStart.setHours(0, 0, 0, 0)
      const replyWindowStart = daysAgo(29, now).toISOString()

      const [
        prospectsResult,
        campaignsResult,
        sentCountResult,
        replyCountResult,
        dueCountResult,
        sentActivityResult,
        replyActivityResult,
      ] = await Promise.all([
        supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('direction', 'outbound').eq('status', 'sent'),
        supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).or('direction.eq.inbound,status.eq.replied'),
        supabase.from('follow_up_sequences').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'Active').lte('next_action_at', now.toISOString()),
        supabase.from('email_messages').select('sent_at').eq('user_id', userId).eq('direction', 'outbound').eq('status', 'sent').gte('sent_at', chartStart.toISOString()),
        supabase.from('email_messages').select('received_at, direction, status').eq('user_id', userId).gte('received_at', replyWindowStart).or('direction.eq.inbound,status.eq.replied'),
      ])

      const results = [prospectsResult, campaignsResult, sentCountResult, replyCountResult, dueCountResult, sentActivityResult, replyActivityResult]
      const failedResult = results.find((result) => result.error)
      if (failedResult?.error) throw failedResult.error

      const days: DailyActivity[] = Array.from({ length: 14 }, (_, index) => ({
        date: format(daysAgo(13 - index, now), 'yyyy-MM-dd'),
        sent: 0,
        replies: 0,
      }))
      const dailyByDate = new Map(days.map((day) => [day.date, day]))

      for (const message of (sentActivityResult.data || []) as { sent_at: string | null }[]) {
        if (!message.sent_at) continue
        const day = dailyByDate.get(format(new Date(message.sent_at), 'yyyy-MM-dd'))
        if (day) day.sent += 1
      }
      for (const message of (replyActivityResult.data || []) as { received_at: string | null; direction: string; status: string }[]) {
        if (message.direction !== 'inbound' && message.status !== 'replied') continue
        if (!message.received_at) continue
        const day = dailyByDate.get(format(new Date(message.received_at), 'yyyy-MM-dd'))
        if (day) day.replies += 1
      }

      const sent = sentCountResult.count || 0
      const replies = replyCountResult.count || 0
      return {
        prospects: prospectsResult.count || 0,
        campaigns: campaignsResult.count || 0,
        sent,
        replies,
        due: dueCountResult.count || 0,
        replyRate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
        dailyActivity: days,
      }
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded bg-slate-200" />)}</div>
      </div>
    )
  }

  if (error) {
    return <p className="py-12 text-center text-sm text-red-600">Could not load analytics: {error.message}</p>
  }

  const dailyActivity = (data?.dailyActivity || []) as DailyActivity[]
  const maxActivity = Math.max(1, ...dailyActivity.flatMap((day) => [day.sent, day.replies]))
  const cards = [
    { label: 'Prospects', value: data?.prospects ?? 0, icon: Users, color: 'bg-blue-100 text-blue-600' },
    { label: 'Campaigns', value: data?.campaigns ?? 0, icon: BarChart3, color: 'bg-purple-100 text-purple-600' },
    { label: 'Emails sent', value: data?.sent ?? 0, icon: Mail, color: 'bg-indigo-100 text-indigo-600' },
    { label: 'Replies received', value: data?.replies ?? 0, icon: MessageCircle, color: 'bg-green-100 text-green-600' },
    { label: 'Reply rate', value: `${data?.replyRate ?? 0}%`, icon: BarChart3, color: 'bg-amber-100 text-amber-600' },
    { label: 'Follow-ups due', value: data?.due ?? 0, icon: Mail, color: 'bg-rose-100 text-rose-600' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Outreach totals and activity calculated from your Supabase records.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <div><p className="text-3xl font-bold text-slate-800">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-800">Email activity</h2>
          <p className="text-sm text-slate-500">Emails sent and replies received per day over the last 14 days</p>
        </div>
        <div className="flex h-56 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-2">
          {dailyActivity.map((day) => (
            <div key={day.date} className="flex h-full min-w-8 flex-1 flex-col justify-end gap-1" title={`${format(new Date(`${day.date}T00:00:00`), 'MMM d')}: ${day.sent} sent, ${day.replies} replies`}>
              <div className="flex h-full items-end justify-center gap-0.5">
                <div className="w-2.5 rounded-t bg-blue-500" style={{ height: `${Math.max(day.sent ? 4 : 0, (day.sent / maxActivity) * 100)}%` }} />
                <div className="w-2.5 rounded-t bg-green-500" style={{ height: `${Math.max(day.replies ? 4 : 0, (day.replies / maxActivity) * 100)}%` }} />
              </div>
              <span className="text-center text-[10px] text-slate-400">{format(new Date(`${day.date}T00:00:00`), 'd')}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />Sent</span>
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />Replies</span>
        </div>
        <p className="mt-3 text-xs text-slate-400">Reply rate = received replies ÷ sent emails. Open and delivery rates are not shown because this app does not track opens or delivery events.</p>
      </Card>
    </div>
  )
}
