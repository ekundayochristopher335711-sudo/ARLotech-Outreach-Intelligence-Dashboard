import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { clearQueryClientCache } from '@/lib/queryClient'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const previousUserId = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true

    const applySession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null
      if (previousUserId.current !== nextUserId) {
        clearQueryClientCache()
        previousUserId.current = nextUserId
      }
      setSession(nextSession)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      if (mounted) applySession(nextSession)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) applySession(nextSession)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
