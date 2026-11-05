import { useQuery } from '@tanstack/react-query'
import { getCurrentUserId, supabase } from '@/lib/supabase'

export function useUnreadReplyCount() {
  return useQuery({
    queryKey: ['/notification-events', 'unread-replies-count'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { count, error } = await supabase
        .from('notification_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'email.received')
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}
