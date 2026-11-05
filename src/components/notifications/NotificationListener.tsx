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
        void queryClient.invalidateQueries({ queryKey: ['/notification-events'] })
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
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notification_events',
        filter: `user_id=eq.${userId}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ['/notification-events'] })
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'notification_events',
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ['/notification-events'] })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, session?.user.id])

  return null
}
