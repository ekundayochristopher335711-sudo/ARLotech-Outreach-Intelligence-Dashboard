import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && window.location.pathname === '/login') {
        navigate('/', { replace: true })
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && window.location.pathname === '/login') {
        navigate('/', { replace: true })
      }
    })
    return () => {
      listener.subscription.unsubscribe()
    }
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(
        typeof error.message === 'string'
          ? error.message
          : JSON.stringify(error),
      )
    } else {
      navigate('/', { replace: true })
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 bg-arlotech flex flex-col items-center justify-center p-12 text-white lg:flex">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10">
          <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="max-w-xl text-center">
          <h1 className="text-4xl font-bold mb-4">Arlotech Outreach Intelligence Dashboard</h1>
          <p className="text-lg text-white/80">
            Manage prospects, analyze websites, generate outreach emails, and track replies—powered by AI.
          </p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:mb-12">
            <h1 className="text-2xl font-bold text-slate-800">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to your Arlotech dashboard</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-arlotech focus:outline-none focus:ring-2 focus:ring-arlotech/20"
                placeholder="Enter your password"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-arlotech py-2.5 text-sm font-semibold text-white hover:bg-arlotech-muted transition-colors focus:outline-none focus:ring-2 focus:ring-arlotech focus:ring-offset-2"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            Sign-in accounts are managed in Supabase.
          </p>
        </div>
      </div>
    </div>
  )
}
