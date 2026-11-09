import { type ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuthState'

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-b-2 border-arlotech rounded-full" /></div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return children
}
