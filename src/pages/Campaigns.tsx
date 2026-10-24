import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { type Campaign } from '@/types'
import { FileText, Filter, Plus } from 'lucide-react'

export function CampaignsPage() {
  const {
    data: campaigns,
    isLoading,
  } = useQuery({
    queryKey: ['/campaigns'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return data
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <Card className="p-6"><div className="h-40 animate-pulse rounded bg-slate-200" /></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campaigns</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and track outreach campaigns</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            <Filter className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg bg-arlotech px-3 py-1.5 text-sm text-white hover:bg-arlotech-muted">
            <Plus className="h-4 w-4" />
            New Campaign
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(campaigns as Campaign[]).map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-arlotech/10 text-arlotech">
                <FileText className="h-5 w-5" />
              </div>
              <Badge variant="default">{c.status}</Badge>
            </div>
            <h3 className="text-lg font-semibold text-slate-800">{c.name}</h3>
            <p className="text-sm text-slate-500 mt-1">{c.description || 'No description'}</p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              {c.industry && <span>{c.industry}</span>}
              {c.location && <>• {c.location}</>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
