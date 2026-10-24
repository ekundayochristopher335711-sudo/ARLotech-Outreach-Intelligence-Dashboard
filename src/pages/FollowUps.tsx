import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { type FollowUpSequence } from '@/types'

export function FollowUpsPage() {
  const { data: sequences, isLoading } = useQuery({
    queryKey: ['/follow-ups'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data } = await supabase
        .from('follow_up_sequences')
        .select('*')
        .eq('user_id', userId)
      return data
    },
  })

  if (isLoading) return <div className="text-center py-12">Loading...</div>

  const active = sequences?.filter((s: { status: string }) => s.status === 'Active') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Follow-ups</h1>
          <p className="text-sm text-slate-500 mt-1">Track and manage follow-up sequences</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-2xl font-bold">{active.length}</p>
          <p className="text-sm text-slate-500">Active</p>
        </Card>
        <Card className="p-5">
          <p className="text-2xl font-bold">{sequences?.length || 0}</p>
          <p className="text-sm text-slate-500">Total</p>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-3">Active Sequences</h2>
        <div className="space-y-2">
          {(sequences as FollowUpSequence[]).map((s) => (
            <div key={s.id} className="flex justify-between border rounded p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{s.prospect_id || 'General'}</span>
              </div>
              <span className="text-xs text-slate-500">{s.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
