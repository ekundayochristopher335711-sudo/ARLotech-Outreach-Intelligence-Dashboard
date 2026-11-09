import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

export const App = lazy(() => import('./App.tsx'))

const queryClient = new QueryClient()
const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export function AppEntry() {
  if (!hasSupabaseConfig) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">Supabase configuration missing</h1>
          <p className="mt-2 text-sm text-slate-600">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file, then restart the
            development server. You can find the anon key in your Supabase project API settings.
          </p>
        </div>
      </main>
    )
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading dashboard...</div>}>
      <App />
    </Suspense>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppEntry />
    </QueryClientProvider>
  </StrictMode>,
)
