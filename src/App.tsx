import { Toaster } from 'sonner'
import { lazy, Suspense, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
} from 'react-router-dom'
import { Menu, Activity, Terminal, Zap } from 'lucide-react'
import { AuthProvider } from '@/hooks/useAuth'
import { useAuth } from '@/hooks/useAuthState'
import { Sidebar } from '@/components/layout/Sidebar'

const LoginPage = lazy(() => import('@/pages/Login').then((module) => ({ default: module.LoginPage })))
const DashboardPage = lazy(() => import('@/pages/Dashboard').then((module) => ({ default: module.DashboardPage })))
const ProspectsPage = lazy(() => import('@/pages/Prospects').then((module) => ({ default: module.ProspectsPage })))
const NewProspectPage = lazy(() => import('@/pages/Prospects').then((module) => ({ default: module.NewProspectPage })))
const ProspectDetails = lazy(() => import('@/pages/ProspectDetails').then((module) => ({ default: module.ProspectDetails })))
const CampaignsPage = lazy(() => import('@/pages/Campaigns').then((module) => ({ default: module.CampaignsPage })))
const RepliesPage = lazy(() => import('@/pages/Replies').then((module) => ({ default: module.RepliesPage })))
const FollowUpsPage = lazy(() => import('@/pages/FollowUps').then((module) => ({ default: module.FollowUpsPage })))
const EmailDraftsPage = lazy(() => import('@/pages/EmailDrafts').then((module) => ({ default: module.EmailDraftsPage })))
const WebsiteIntelligencePage = lazy(() => import('@/pages/WebsiteIntelligence').then((module) => ({ default: module.WebsiteIntelligencePage })))
const AnalyticsDashboard = lazy(() => import('@/pages/Analytics').then((module) => ({ default: module.AnalyticsDashboard })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((module) => ({ default: module.SettingsPage })))

function PageLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm text-slate-500">Loading page...</span>
    </div>
  )
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-b-2 border-arlotech rounded-full" />
      </div>
    )
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-b-2 border-arlotech rounded-full" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [blacksite, setBlacksite] = useState(() => {
    try { return localStorage.getItem('arlotech-login-mode') === 'blacksite' } catch { return false }
  })

  const toggleTheme = () => {
    const nextBlacksite = !blacksite
    setBlacksite(nextBlacksite)
    try {
      localStorage.setItem('arlotech-login-mode', nextBlacksite ? 'blacksite' : 'standard')
    } catch {
      // Theme selection still works for the current session when storage is unavailable.
    }
  }

  const closeSidebar = () => setMobileOpen(false)

  return (
    <div className={`app-shell flex h-dvh overflow-hidden ${blacksite ? 'theme-blacksite' : 'theme-standard'}`} data-theme={blacksite ? 'blacksite' : 'standard'}>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={closeSidebar}
          aria-label="Close navigation menu"
        />
      )}
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onNavigate={closeSidebar}
      />
      <div className="app-workspace flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-topbar flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-arlotech lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-controls="app-sidebar"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="topbar-brand text-sm font-semibold text-slate-800">ARLOTECH <span>INTELLIGENCE</span></span>
          <div className="topbar-system-status"><span className="status-live-dot" /> <span>{blacksite ? 'SECURE NODE // ACTIVE' : 'WORKSPACE ONLINE'}</span><span className="topbar-divider">/</span><span className="topbar-clock">{blacksite ? 'TRACE: NULL' : 'OUTREACH CONSOLE'}</span></div>
          <button
            type="button"
            className="app-mode-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${blacksite ? 'standard' : 'blacksite'} visual theme`}
            aria-pressed={blacksite}
          >
            {blacksite ? <Terminal size={14} /> : <Zap size={14} />}
            <span>{blacksite ? 'BLACKSITE' : 'STANDARD'}</span>
            <span className={`app-toggle-track ${blacksite ? 'is-on' : ''}`} aria-hidden="true"><i /></span>
          </button>
          <div className="topbar-mark" aria-hidden="true"><Activity size={16} /><span>AOI</span></div>
        </header>
        <div className="min-w-0 flex-1 overflow-auto">
          <main className="app-main min-h-full p-4 lg:p-7">
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="prospects" element={<ProspectsPage />} />
                <Route path="prospects/new" element={<NewProspectPage />} />
                <Route path="prospects/:id" element={<ProspectDetails />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="replies" element={<RepliesPage />} />
                <Route path="follow-ups" element={<FollowUpsPage />} />
                <Route path="email-drafts" element={<EmailDraftsPage />} />
                <Route path="website-intelligence" element={<WebsiteIntelligencePage />} />
                <Route path="analytics" element={<AnalyticsDashboard />} />
                <Route path="settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Suspense fallback={<PageLoading />}>
                  <LoginPage />
                </Suspense>
              </PublicRoute>
            }
          />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <AppShell />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}