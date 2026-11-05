import { useQuery } from '@tanstack/react-query'
import { getCurrentUserId, supabase } from '@/lib/supabase'

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['/notification-events', 'unread-notifications-count'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { count, error } = await supabase
        .from('notification_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}
