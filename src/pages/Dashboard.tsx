import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { ProspectTable } from '@/components/dashboard/ProspectTable'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { type DashboardMetrics } from '@/types'
import { toast } from 'sonner'
import { exportDashboardPdf } from '@/lib/exportPdf'

export function DashboardPage() {
  const navigate = useNavigate()
  const blacksite = (() => {
    try {
      return localStorage.getItem('arlotech-login-mode') === 'blacksite'
    } catch {
      return false
    }
  })()
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/dashboard/metrics'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const [
        { count: totalProspects, error: prospectsError },
        { count: contactedProspects, error: contactedError },
        { count: sentEmails, error: sentError },
        { count: receivedReplies, error: repliesError },
      ] = await Promise.all([
        supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase
          .from('prospects')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .not('last_contacted_at', 'is', null),
        supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('direction', 'outbound')
          .eq('status', 'sent'),
        supabase
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('direction', 'inbound'),
      ])
      const queryError = prospectsError || contactedError || sentError || repliesError
      if (queryError) throw queryError
      return {
        total_prospects: totalProspects ?? 0,
        prospects_contacted: contactedProspects ?? 0,
        emails_sent: sentEmails ?? 0,
        replies_received: receivedReplies ?? 0,
        interested_prospects: 0,
        follow_ups_due: 0,
        meetings_booked: 0,
        clients_won: 0,
      } satisfies DashboardMetrics
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
    if (blacksite) {
      return (
        <div className="blacksite-deck" role="status">
          <div className="blacksite-kicker"><span /> REBUILDING COMMAND DECK</div>
          <div className="blacksite-metric-grid">
            {[1, 2, 3, 4].map((number) => (
              <div className="blacksite-metric animate-pulse" key={number}>
                <strong>--</strong>
                <span className="blacksite-metric-label">LOADING TELEMETRY</span>
              </div>
            ))}
          </div>
          <div className="blacksite-panel h-64 animate-pulse" />
        </div>
      )
    }
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

  if (blacksite) {
    const metricsRows = [
      { code: 'TGT', label: 'REGISTERED TARGETS', value: metrics?.total_prospects ?? 0, note: 'TARGET RECORDS' },
      { code: 'OUT', label: 'OUTBOUND CONTACTS', value: metrics?.prospects_contacted ?? 0, note: 'CONTACTED RECORDS' },
      { code: 'TX', label: 'TRANSMISSIONS SENT', value: metrics?.emails_sent ?? 0, note: 'DELIVERED EMAILS' },
      { code: 'RX', label: 'INBOUND SIGNALS', value: metrics?.replies_received ?? 0, note: 'REPLIES RECEIVED' },
    ]
    return (
      <div className="blacksite-deck">
        <section className="blacksite-deck-heading">
          <div>
            <div className="blacksite-kicker"><span /> OPERATIONS CONTROL // AUTHORIZED SESSION</div>
            <h1>COMMAND DECK</h1>
            <p>Field intelligence overview <b> / </b> campaign telemetry and contact activity</p>
          </div>
          <button
            type="button"
            className="blacksite-export"
            onClick={() => {
              exportDashboardPdf(metrics, prospects || [], activity || [])
              toast.success('Intelligence brief exported')
            }}
          >
            <span>↓</span> EXPORT INTELLIGENCE BRIEF
          </button>
        </section>

        <section className="blacksite-metric-grid" aria-label="Operational metrics">
          {metricsRows.map((item, index) => (
            <article className="blacksite-metric" key={item.code}>
              <div className="blacksite-metric-top"><span>{item.code} // 0{index + 1}</span><i /></div>
              <strong>{item.value.toLocaleString()}</strong>
              <span className="blacksite-metric-label">{item.label}</span>
              <small>{item.note}</small>
              <div className="blacksite-metric-line">
                <i style={{ width: `${Math.min(100, Number(item.value) > 0 ? 24 + Number(item.value) % 76 : 4)}%` }} />
              </div>
            </article>
          ))}
        </section>

        <section className="blacksite-deck-grid">
          <article className="blacksite-panel blacksite-activity-panel">
            <header className="blacksite-panel-head">
              <div><span className="blacksite-panel-index">01 / LIVE FEED</span><h2>OPERATIONAL LEDGER</h2></div>
              <span className="blacksite-live-tag"><i /> LIVE</span>
            </header>
            <div className="blacksite-panel-body"><ActivityFeed activity={activity || []} /></div>
            <footer className="blacksite-panel-foot">
              <span>EVENT STREAM // RECENT 10</span>
              <button type="button" onClick={() => navigate('/replies')}>OPEN INTERCEPTS ↗</button>
            </footer>
          </article>
          <article className="blacksite-panel blacksite-target-panel">
            <header className="blacksite-panel-head">
              <div><span className="blacksite-panel-index">02 / FIELD RECORDS</span><h2>RECENT TARGET DOSSIERS</h2></div>
              <span className="blacksite-record-count">{(prospects || []).length.toString().padStart(2, '0')} RECORDS</span>
            </header>
            <div className="blacksite-panel-body"><ProspectTable prospects={prospects || []} compact /></div>
            <footer className="blacksite-panel-foot">
              <span>REGISTRY // MOST RECENT</span>
              <button type="button" onClick={() => navigate('/prospects')}>ACCESS REGISTRY ↗</button>
            </footer>
          </article>
        </section>
        <div className="blacksite-deck-footer">
          <span>ARLOTECH INTELLIGENCE SYSTEMS</span>
          <span>NODE 09 <i /> SESSION ACTIVE</span>
          <span>END OF OVERVIEW</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{blacksite ? 'COMMAND DECK' : 'Dashboard'}</h1>
          <p className="text-sm text-slate-500 mt-1">{blacksite ? 'Operational overview // campaign telemetry and field activity' : 'Welcome to your outreach intelligence dashboard'}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => {
            exportDashboardPdf(metrics, prospects || [], activity || [])
            toast.success('Exported as PDF')
          }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            {blacksite ? 'EXPORT BRIEF' : 'Export'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={blacksite ? 'Registered Targets' : 'Total Prospects'}
          value={metrics?.total_prospects ?? 0}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.768 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>}
        />
        <MetricCard
          label={blacksite ? 'Targets Contacted' : 'Contacted Prospects'}
          value={metrics?.prospects_contacted ?? 0}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.253-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>}
        />
        <MetricCard
          label={blacksite ? 'Transmissions Sent' : 'Emails Sent'}
          value={metrics?.emails_sent ?? 0}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
        />
        <MetricCard
          label={blacksite ? 'Signals Intercepted' : 'Replies Received'}
          value={metrics?.replies_received ?? 0}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">{blacksite ? 'Operational Ledger' : 'Recent Activity'}</h2>
            <button type="button" onClick={() => navigate('/replies')} className="text-sm text-arlotech hover:underline">
              {blacksite ? 'OPEN LEDGER' : 'View all'}
            </button>
          </div>
          <ActivityFeed activity={activity || []} />
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">{blacksite ? 'Recent Target Records' : 'Recent Prospects'}</h2>
            <button type="button" onClick={() => navigate('/prospects')} className="text-sm text-arlotech hover:underline">
              {blacksite ? 'OPEN REGISTRY' : 'View all'}
            </button>
          </div>
          <ProspectTable prospects={prospects || []} compact />
        </Card>
      </div>
    </div>
  )
}
