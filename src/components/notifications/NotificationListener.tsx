import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuthState'
import { supabase } from '@/lib/supabase'

export function NotificationListener() {
  const { session } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) return

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notification_events',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const notification = payload.new as { title?: string; body?: string }
        void queryClient.invalidateQueries({ queryKey: ['/email-messages'] })
        void queryClient.invalidateQueries({ queryKey: ['/dashboard/metrics'] })
        if (typeof notification.title === 'string') {
          toast(notification.title, {
            description: typeof notification.body === 'string' ? notification.body : undefined,
            duration: 8000,
          })
        }
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, session?.user.id])

  return null
}
