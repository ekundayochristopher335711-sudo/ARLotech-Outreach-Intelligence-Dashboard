import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Bell, Check, Mail, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getCurrentUserId, supabase } from '@/lib/supabase'
import { useUnreadReplyCount } from '@/hooks/useUnreadReplyCount'

type NotificationEvent = {
  id: string
  email_message_id: string | null
  event_type: string
  title: string
  body: string
  created_at: string
  read_at: string | null
}

export function NotificationCenter() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const { data: unreadReplyCount = 0, error: unreadCountError } = useUnreadReplyCount()
  const { data: notifications = [], isLoading, error } = useQuery<NotificationEvent[]>({
    queryKey: ['/notification-events', 'latest'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      const { data, error } = await supabase
        .from('notification_events')
        .select('id, email_message_id, event_type, title, body, created_at, read_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as NotificationEvent[]
    },
  })

  const invalidateNotifications = () => {
    void queryClient.invalidateQueries({ queryKey: ['/notification-events'] })
  }

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('notification_events')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: invalidateNotifications,
    onError: (error: Error) => toast.error(error.message || 'Could not mark notification as read.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      const { error } = await supabase
        .from('notification_events')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: invalidateNotifications,
    onError: (error: Error) => toast.error(error.message || 'Could not delete notification.'),
  })

  const openNotification = async (notification: NotificationEvent) => {
    try {
      if (!notification.read_at) await markReadMutation.mutateAsync(notification.id)
      setIsOpen(false)
      navigate(notification.email_message_id
        ? `/replies?messageId=${encodeURIComponent(notification.email_message_id)}`
        : '/replies')
    } catch (actionError) {
      console.error('Could not mark notification as read.', actionError)
      toast.error(actionError instanceof Error ? actionError.message : 'Could not open this notification.')
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
    } catch (actionError) {
      console.error('Could not delete notification.', actionError)
      toast.error(actionError instanceof Error ? actionError.message : 'Could not delete this notification.')
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={unreadReplyCount > 0 ? `Notifications, ${unreadReplyCount} unread replies` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-arlotech"
      >
        <Bell className="h-5 w-5" />
        {unreadReplyCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadReplyCount > 99 ? '99+' : unreadReplyCount}
          </span>
        )}
      </button>
      {isOpen && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-[60] mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="text-xs text-slate-500">{unreadReplyCount} unread replies</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              Close
            </button>
          </div>
          {unreadCountError && (
            <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
              Could not load unread reply count: {unreadCountError.message}
            </p>
          )}
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-2">
            {isLoading ? (
              <p className="p-4 text-sm text-slate-500">Loading notifications...</p>
            ) : error ? (
              <p role="alert" className="p-4 text-sm text-red-600">
                Could not load notifications: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No notifications yet.</p>
            ) : notifications.map((notification: NotificationEvent) => (
              <article
                key={notification.id}
                className={`flex items-start gap-2 rounded-lg p-3 ${notification.read_at ? 'bg-white' : 'bg-emerald-50'}`}
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-arlotech" />
                <button
                  type="button"
                  onClick={() => void openNotification(notification)}
                  disabled={markReadMutation.isPending}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arlotech"
                >
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {notification.title}
                    {!notification.read_at && <span className="h-2 w-2 rounded-full bg-emerald-600" aria-label="Unread" />}
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">{notification.body}</span>
                  <span className="mt-1 block text-[11px] text-slate-400">
                    {format(new Date(notification.created_at), 'MMM d, yyyy HH:mm')}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {!notification.read_at && (
                    <button
                      type="button"
                      onClick={() => markReadMutation.mutate(notification.id)}
                      disabled={markReadMutation.isPending}
                      aria-label={`Mark ${notification.title} as read`}
                      title="Mark as read"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-arlotech disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteNotification(notification.id)}
                    disabled={deleteMutation.isPending}
                    aria-label={`Delete ${notification.title}`}
                    title="Delete notification"
                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
