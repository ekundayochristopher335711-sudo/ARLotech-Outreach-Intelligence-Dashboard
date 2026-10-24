import { Card } from '@/components/ui/Card'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account and integrations</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Integration Status</h2>
        <div className="space-y-3">
          {[
            { provider: 'Gmail', status: 'Connected', color: 'bg-green-100 text-green-700', icon: 'mail' },
            { provider: 'Outlook', status: 'Pending', color: 'bg-amber-100 text-amber-700', icon: 'mail' },
            { provider: 'LinkedIn', status: 'Not Connected', color: 'bg-slate-100 text-slate-600', icon: 'linkedin' },
          ].map((i) => (
            <div key={i.provider} className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${i.color}`}>
                  {i.icon === 'mail' && <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>}
                  {i.icon === 'linkedin' && <svg className="h-5 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/></svg>}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{i.provider}</p>
                  <p className="text-xs text-slate-400">{i.status}</p>
                </div>
              </div>
              <button type="button" className="text-xs text-arlotech hover:underline">
                {i.status === 'Connected' ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
        <div className="space-y-3">
          {[
            { label: 'Daily summary', description: 'Receive a daily summary of your outreach activity' },
            { label: 'Reply alerts', description: 'Get notified when prospects reply' },
            { label: 'Follow-up reminders', description: 'Get reminded about pending follow-ups' },
          ].map((n) => (
            <div key={n.label} className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-800">{n.label}</p>
                <p className="text-xs text-slate-400">{n.description}</p>
              </div>
              <div className="relative">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer:checked:after:translate-x-full peer:checked:after:bg-arlotech" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
