import { useQuery } from '@tanstack/react-query'
import { Activity as ActivityIcon } from 'lucide-react'
import { useState } from 'react'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuthState'
import { supabase } from '@/lib/supabase'
import { type ActivityLogEntry } from '@/types'

const ACTIVITY_PAGE_SIZE = 50

export function ActivityPage() {
  const { session } = useAuth()
  const [page, setPage] = useState(0)
  const blacksite = (() => {
    try {
      return localStorage.getItem('arlotech-login-mode') === 'blacksite'
    } catch {
      return false
    }
  })()

  const {
    data: activity,
    error,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: ['/activity-history', session?.user.id, page],
    queryFn: async () => {
      const userId = session?.user.id
      if (!userId) throw new Error('You must be signed in to view activity history.')

      const { data: entries, error: queryError } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(page * ACTIVITY_PAGE_SIZE, (page + 1) * ACTIVITY_PAGE_SIZE)

      if (queryError) throw queryError
      return entries as ActivityLogEntry[]
    },
    enabled: Boolean(session?.user.id),
  })

  const hasOlderActivity = (activity?.length ?? 0) > ACTIVITY_PAGE_SIZE
  const visibleActivity = activity?.slice(0, ACTIVITY_PAGE_SIZE) ?? []

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="rounded-lg bg-arlotech/10 p-2 text-arlotech">
          <ActivityIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {blacksite ? 'OPERATIONAL LEDGER' : 'Activity history'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review changes and actions recorded across your workspace.
          </p>
        </div>
      </header>

      <Card className="p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-slate-500" role="status">Loading activity history…</p>
        ) : error ? (
          <p className="text-sm text-red-600" role="alert">
            Could not load activity history: {error.message}
          </p>
        ) : (
          <>
            <ActivityFeed activity={visibleActivity} />
            {(page > 0 || hasOlderActivity) && (
              <div className="mt-5 flex flex-wrap justify-center gap-3 border-t border-slate-200 pt-4">
                {page > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                    disabled={isFetching}
                  >
                    Newer activity
                  </Button>
                )}
                {hasOlderActivity && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={isFetching}
                >
                  {isFetching ? 'Loading…' : 'Load earlier activity'}
                </Button>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
