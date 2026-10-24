import { Card } from '@/components/ui/Card'

const stats = [
  { label: 'Emails', value: '1,247', change: '+12%', icon: 'mail', color: 'bg-blue-100 text-blue-600' },
  { label: 'Replies', value: '284', change: '+8%', icon: 'reply', color: 'bg-green-100 text-green-600' },
  { label: 'Replies', value: '284', change: '+8%', icon: 'reply', color: 'bg-green-100 text-green-600' },
  { label: 'Open Rate', value: '41%', change: '+3%', icon: 'chart', color: 'bg-amber-100 text-amber-600' },
]

export function AnalyticsDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Track your outreach performance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-slate-800">{s.value}</p>
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.color}`}>
                {s.icon === 'mail' && <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
                {s.icon === 'reply' && <svg className="h-5 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>}
                {s.icon === 'chart' && <svg className="h-5 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2"/></svg>}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-slate-600">{s.change}</span>
              <span className="text-xs text-slate-400">vs last month</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-lg font-semibold mb-4">Email Performance</h3>
          <div className="space-y-3">
            {[
              { segment: 'Prospects', value: '24%', color: 'bg-blue-500' },
              { segment: 'Existing Clients', value: '18%', color: 'bg-green-500' },
              { segment: 'Partners', value: '12%', color: 'bg-amber-500' },
              { segment: 'Agents', value: '10%', color: 'bg-purple-500' },
              { segment: 'Partners', value: '8%', color: 'bg-red-500' },
            ].map((d) => (
              <div key={d.segment}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{d.segment}</span>
                  <span className="text-slate-500">{d.value}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${d.color}`} style={{ width: `${parseInt(d.value)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-lg font-semibold mb-4">Delivery Status</h3>
          <div className="space-y-3">
            {[
              { status: 'Delivered', value: '92%', color: 'bg-green-500' },
              { status: 'Pending', value: '5%', color: 'bg-amber-500' },
              { status: 'Bounced', value: '2%', color: 'bg-red-500' },
              { status: 'Spam', value: '1%', color: 'bg-red-600' },
            ].map((d) => (
              <div key={d.status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{d.status}</span>
                  <span className="text-slate-500">{d.value}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${d.color}`} style={{ width: `${parseInt(d.value)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
