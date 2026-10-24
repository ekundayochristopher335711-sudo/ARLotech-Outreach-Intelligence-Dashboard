import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { ProspectTable } from '@/components/dashboard/ProspectTable'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { type DashboardMetrics } from '@/types'

export function DashboardPage() {
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/dashboard/metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_metrics')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return (data ?? {
        total_prospects: 0,
        prospects_contacted: 0,
        emails_sent: 0,
        replies_received: 0,
        interested_prospects: 0,
        follow_ups_due: 0,
        meetings_booked: 0,
        clients_won: 0,
      }) as DashboardMetrics
    },
  })

  const {
    data: prospects,
    isLoading: prospectsLoading,
  } = useQuery({
    queryKey: ['/prospects'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })

  const {
    data: activity,
    isLoading: activityLoading,
  } = useQuery({
    queryKey: ['/activity'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data
    },
  })

  if (isLoading || prospectsLoading || activityLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded bg-slate-200" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-slate-500">Failed to load dashboard</p>
        <p className="text-sm text-slate-400 mt-1">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome to your outreach intelligence dashboard</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Prospects"
          value={metrics?.total_prospects ?? 0}
          change="+12% vs last month"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.768 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
        <MetricCard
          label="Contacted Prospects"
          value={metrics?.prospects_contacted ?? 0}
          change="+8% vs last month"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.253-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>}
        />
        <MetricCard
          label="Emails Sent"
          value={metrics?.emails_sent ?? 0}
          change="+23% vs last month"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
        />
        <MetricCard
          label="Replies Received"
          value={metrics?.replies_received ?? 0}
          change="+15% vs last month"
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent Activity</h2>
            <button type="button" className="text-sm text-arlotech hover:underline">
              View all
            </button>
          </div>
          <ActivityFeed activity={activity || []} />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent Prospects</h2>
            <button type="button" className="text-sm text-arlotech hover:underline">
              View all
            </button>
          </div>
          <ProspectTable prospects={prospects || []} compact />
        </Card>
      </div>
    </div>
  )
}
