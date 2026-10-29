import { Toaster } from 'sonner'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
} from 'react-router-dom'
import { Menu, Activity, RadioTower, Crosshair, DatabaseZap } from 'lucide-react'
import { AuthProvider } from '@/hooks/useAuth'
import { useAuth } from '@/hooks/useAuthState'
import { useLocation } from 'react-router-dom'
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
  const blacksite = (() => { try { return localStorage.getItem('arlotech-login-mode') === 'blacksite' } catch { return false } })()
  return blacksite ? (
    <div className="blacksite-loading" role="status" aria-live="polite">
      <div className="loading-sigil"><span /><span /><span /></div>
      <strong>RECONSTRUCTING WORKSPACE</strong>
      <div className="loading-track"><i /></div>
      <small>ROUTING SIGNAL // VALIDATING LOCAL MODULES</small>
    </div>
  ) : (
    <div className="standard-loading" role="status" aria-live="polite"><div className="animate-spin h-8 w-8 border-b-2 border-arlotech rounded-full" /><span>Loading workspace…</span></div>
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

function MatrixBackdrop() {
  const [streams, setStreams] = useState<string[]>(() => Array.from({ length: 64 }, () => Array.from({ length: 42 }, () => Math.random() > .5 ? '1' : '0').join('\n')))
  useEffect(() => {
    const timer = window.setInterval(() => {
      setStreams((current) => current.map((stream) => stream.split('\n').map((bit) => Math.random() > .58 ? (Math.random() > .5 ? '1' : '0') : bit).join('\n')))
    }, 190)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="blacksite-matrix-field" aria-hidden="true">{streams.map((stream, index) => <span key={index} style={{ animationDelay: `${-(index % 13) * 1.7}s`, animationDuration: `${12 + (index % 9) * 2}s` }}>{stream}</span>)}</div>
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const [blacksite, setBlacksite] = useState(() => {
    try { return localStorage.getItem('arlotech-login-mode') === 'blacksite' } catch { return false }
  })


  useEffect(() => {
    const syncMode = () => setBlacksite(localStorage.getItem('arlotech-login-mode') === 'blacksite')
    window.addEventListener('arlotech-mode-change', syncMode)
    window.addEventListener('storage', syncMode)
    return () => {
      window.removeEventListener('arlotech-mode-change', syncMode)
      window.removeEventListener('storage', syncMode)
    }
  }, [])

  const closeSidebar = () => setMobileOpen(false)
  const blacksiteCopy: Record<string, { title: string; sub: string }> = {
    '/': { title: 'COMMAND DECK', sub: 'LIVE CAMPAIGN TELEMETRY' },
    '/prospects': { title: 'TARGET REGISTRY', sub: 'LEAD ACQUISITION & DOSSIERS' },
    '/prospects/new': { title: 'NEW DOSSIER', sub: 'TARGET RECORD INITIALIZATION' },
    '/website-intelligence': { title: 'SURFACE RECON', sub: 'DOMAIN INTELLIGENCE & EXPOSURE REVIEW' },
    '/campaigns': { title: 'DEPLOYMENT CONTROL', sub: 'OUTBOUND OPERATION SEQUENCING' },
    '/email-drafts': { title: 'PAYLOAD LAB', sub: 'MESSAGE ASSEMBLY & DELIVERY PREP' },
    '/replies': { title: 'INTERCEPTS', sub: 'INBOUND SIGNALS & RESPONSE TRIAGE' },
    '/follow-ups': { title: 'EXTRACTION QUEUE', sub: 'PENDING CONTACT RECOVERY' },
    '/analytics': { title: 'SIGNAL ANALYSIS', sub: 'PERFORMANCE INTELLIGENCE' },
    '/settings': { title: 'SYSTEM CONTROLS', sub: 'NODE CONFIGURATION' },
  }
  const activeBlacksiteCopy = blacksiteCopy[location.pathname] || (location.pathname.startsWith('/prospects/') ? { title: 'TARGET DOSSIER', sub: 'RECORD INTELLIGENCE' } : { title: 'FIELD OPERATIONS', sub: 'INTELLIGENCE CHANNEL ACTIVE' })

  return (
    <div className={`app-shell flex h-dvh overflow-hidden ${blacksite ? 'theme-blacksite' : 'theme-standard'}`} data-theme={blacksite ? 'blacksite' : 'standard'} data-route={location.pathname}>
      {blacksite && <MatrixBackdrop />}
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
          <span className="topbar-brand flex items-center" aria-label="ArloTech">{blacksite ? <img src="/blacksite%20logo.jpg" alt="ArloTech Blacksite" className="h-8 w-auto" /> : <img src="/logo.jpg" alt="ArloTech" className="h-8 w-auto" />}</span>
          <div className="topbar-system-status"><span className="status-live-dot" /> <span>{blacksite ? 'UPLINK ESTABLISHED' : 'WORKSPACE ONLINE'}</span><span className="topbar-divider">/</span><span className="topbar-clock">{blacksite ? 'TRACE NULL // UPLINK LIVE' : 'OUTREACH CONSOLE'}</span></div>
          <div className="topbar-mark" aria-hidden="true">{blacksite ? <RadioTower size={16} /> : <Activity size={16} />}<span>{blacksite ? 'NODE 09' : 'AOI'}</span></div>
        </header>
        <div className="min-w-0 flex-1 overflow-auto">
          {blacksite && <div className="blacksite-command-ribbon"><span><Crosshair size={13}/> {activeBlacksiteCopy.title}</span><span><DatabaseZap size={13}/> {activeBlacksiteCopy.sub}</span><span className="ribbon-trace">TRACE ROUTE // MASKED</span></div>}
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