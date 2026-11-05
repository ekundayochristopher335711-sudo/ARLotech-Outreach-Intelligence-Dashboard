import { getCurrentUserId, supabase } from '@/lib/supabase'

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function isBrowserPushSupported() {
  return typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

export async function getBrowserPushEnabled() {
  if (!isBrowserPushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return false

  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', userId)
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()
  if (error) throw error
  return !!data
}

function decodeVapidPublicKey(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(padded)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export async function enableBrowserPush() {
  if (!isBrowserPushSupported()) {
    throw new Error('Browser push notifications need a supported browser and a secure HTTPS connection.')
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Browser push notifications are not configured for this app yet.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked in this browser. Allow them in browser settings, then try again.'
      : 'Notification permission was not granted.')
  }

  const userId = await getCurrentUserId()
  const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' })
  const subscription = await registration.pushManager.getSubscription() ??
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(VAPID_PUBLIC_KEY),
    })
  const keys = subscription.toJSON().keys
  if (!keys?.p256dh || !keys.auth) {
    throw new Error('The browser returned an incomplete notification subscription.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,endpoint' })
  if (error) throw error
}

export async function disableBrowserPush() {
  if (!isBrowserPushSupported()) return

  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', subscription.endpoint)
  if (error) throw error

  const unsubscribed = await subscription.unsubscribe()
  if (!unsubscribed) throw new Error('The browser could not disable this notification subscription.')
}
