import { Toaster } from 'sonner'
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  NavLink,
} from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardList,
  Crosshair,
  DatabaseZap,
  FileText,
  Globe,
  Home,
  Mail,
  Menu,
  MessageCircle,
  MoreHorizontal,
  RadioTower,
  Settings,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { AuthProvider } from '@/hooks/useAuth'
import { useAuth } from '@/hooks/useAuthState'
import { useLocation } from 'react-router-dom'
import { useAccessibleDialog } from '@/hooks/useAccessibleDialog'
import { Sidebar } from '@/components/layout/Sidebar'
import { NotificationListener } from '@/components/notifications/NotificationListener'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'
import {
  ARLOTECH_BLACKSITE_LOGO_FILE,
  ARLOTECH_FAVICON_FILE,
  ARLOTECH_LOGO_FILE,
  getBrandAssetUrl,
} from '@/lib/brandAssets'

const LoginPage = lazy(() => import('@/pages/Login').then((module) => ({ default: module.LoginPage })))
const DashboardPage = lazy(() => import('@/pages/Dashboard').then((module) => ({ default: module.DashboardPage })))
const ActivityPage = lazy(() => import('@/pages/Activity').then((module) => ({ default: module.ActivityPage })))
const ProspectsPage = lazy(() => import('@/pages/Prospects').then((module) => ({ default: module.ProspectsPage })))
const NewProspectPage = lazy(() => import('@/pages/Prospects').then((module) => ({ default: module.NewProspectPage })))
const ProspectDetails = lazy(() => import('@/pages/ProspectDetails').then((module) => ({ default: module.ProspectDetails })))
const CampaignsPage = lazy(() => import('@/pages/Campaigns').then((module) => ({ default: module.CampaignsPage })))
const RepliesPage = lazy(() => import('@/pages/Replies').then((module) => ({ default: module.RepliesPage })))
const FollowUpsPage = lazy(() => import('@/pages/FollowUps').then((module) => ({ default: module.FollowUpsPage })))
const EmailDraftsPage = lazy(() => import('@/pages/EmailDrafts').then((module) => ({ default: module.EmailDraftsPage })))
const WebsiteIntelligencePage = lazy(() => import('@/pages/WebsiteIntelligence').then((module) => ({ default: module.WebsiteIntelligencePage })))
const AnalyticsDashboard = lazy(() => import('@/pages/Analytics').then((module) => ({ default: module.AnalyticsDashboard })))
const GrowthCenterPage = lazy(() => import('@/pages/GrowthCenter').then((module) => ({ default: module.GrowthCenterPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((module) => ({ default: module.SettingsPage })))
const UnsubscribePage = lazy(() => import('@/pages/Unsubscribe').then((module) => ({ default: module.UnsubscribePage })))

const mobilePrimaryItems = [
  { label: 'Home', path: '/', icon: Home, exact: true },
  { label: 'Prospects', path: '/prospects', icon: Users },
  { label: 'Audits', path: '/website-intelligence', icon: Globe },
  { label: 'Outreach', path: '/email-drafts', icon: Mail },
]

const mobileMoreGroups = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Activity', path: '/activity', icon: Activity },
      { label: 'Campaigns', path: '/campaigns', icon: FileText },
      { label: 'Replies', path: '/replies', icon: MessageCircle },
      { label: 'Follow-ups', path: '/follow-ups', icon: CalendarClock },
    ],
  },
  {
    title: 'INTELLIGENCE',
    items: [
      { label: 'Website Intelligence', path: '/website-intelligence', icon: Globe },
      { label: 'Analytics', path: '/analytics', icon: BarChart3 },
      { label: 'Growth Center', path: '/growth-center', icon: Sparkles },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [{ label: 'Settings', path: '/settings', icon: Settings }],
  },
]

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

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const morePanelRef = useAccessibleDialog<HTMLElement>(moreOpen, () => setMoreOpen(false), true)
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

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (favicon) favicon.href = getBrandAssetUrl(ARLOTECH_FAVICON_FILE)
    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (appleIcon) appleIcon.href = getBrandAssetUrl(ARLOTECH_FAVICON_FILE)
    document.title = blacksite ? 'BLACKSITE | Arlotech Intelligence' : 'Arlotech Outreach Intelligence'
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', blacksite ? '#030603' : '#f4f7f9')
  }, [blacksite])

  const closeSidebar = () => setMobileOpen(false)
  const closeMore = () => setMoreOpen(false)
  const moreRouteIsActive = mobileMoreGroups.some((group) =>
    group.items.some(({ path }) => location.pathname === path || location.pathname.startsWith(`${path}/`)),
  )
  const blacksiteCopy: Record<string, { title: string; sub: string }> = {
    '/': { title: 'COMMAND DECK', sub: 'LIVE CAMPAIGN TELEMETRY' },
    '/activity': { title: 'OPERATIONAL LEDGER', sub: 'WORKSPACE CHANGE HISTORY' },
    '/prospects': { title: 'TARGET REGISTRY', sub: 'LEAD ACQUISITION & DOSSIERS' },
    '/prospects/new': { title: 'NEW DOSSIER', sub: 'TARGET RECORD INITIALIZATION' },
    '/website-intelligence': { title: 'SURFACE RECON', sub: 'DOMAIN INTELLIGENCE & EXPOSURE REVIEW' },
    '/campaigns': { title: 'TRANSMISSION OPS', sub: 'OUTBOUND OPERATION SEQUENCING' },
    '/email-drafts': { title: 'PAYLOAD LAB', sub: 'MESSAGE ASSEMBLY & DELIVERY PREP' },
    '/replies': { title: 'INTERCEPTS', sub: 'INBOUND SIGNALS & RESPONSE TRIAGE' },
    '/follow-ups': { title: 'EXTRACTION QUEUE', sub: 'PENDING CONTACT RECOVERY' },
    '/analytics': { title: 'SIGNAL ANALYSIS', sub: 'PERFORMANCE INTELLIGENCE' },
    '/growth-center': { title: 'GROWTH OPERATIONS', sub: 'PROSPECT PRIORITY & CLIENT CONVERSION' },
    '/settings': { title: 'SYSTEM CONTROLS', sub: 'NODE CONFIGURATION' },
  }
  const activeBlacksiteCopy = blacksiteCopy[location.pathname] || (location.pathname.startsWith('/prospects/') ? { title: 'TARGET DOSSIER', sub: 'RECORD INTELLIGENCE' } : { title: 'FIELD OPERATIONS', sub: 'INTELLIGENCE CHANNEL ACTIVE' })

  return (
    <div className={`app-shell flex h-dvh overflow-hidden ${blacksite ? 'theme-blacksite' : 'theme-standard'}`} data-theme={blacksite ? 'blacksite' : 'standard'} data-route={location.pathname}>
      <NotificationListener />
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
        <header className="app-topbar flex h-20 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
          <button
            type="button"
            className="mobile-menu-trigger rounded-md p-2.5 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-arlotech lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-controls="app-sidebar"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="topbar-brand flex items-center" aria-label="Arlotech Digital Solutions">
            <img
              src={getBrandAssetUrl(blacksite ? ARLOTECH_BLACKSITE_LOGO_FILE : ARLOTECH_LOGO_FILE)}
              alt="Arlotech Digital Solutions"
              className="topbar-logo-image"
            />
          </span>
          <div className="topbar-system-status"><span className="status-live-dot" /> <span>{blacksite ? 'UPLINK ESTABLISHED' : 'WORKSPACE ONLINE'}</span><span className="topbar-divider">/</span><span className="topbar-clock">{blacksite ? 'TRACE NULL // UPLINK LIVE' : 'OUTREACH CONSOLE'}</span></div>
          <NotificationCenter className="topbar-notification-center" />
          <div className="topbar-mark" aria-hidden="true">{blacksite ? <RadioTower size={18} /> : <Activity size={18} />}<span>{blacksite ? 'NODE 09' : 'AOI'}</span></div>
        </header>
        <div className="min-w-0 flex-1 overflow-auto">
          {blacksite && <div className="blacksite-command-ribbon"><span><Crosshair size={13}/> {activeBlacksiteCopy.title}</span><span><DatabaseZap size={13}/> {activeBlacksiteCopy.sub}</span><span className="ribbon-trace">TRACE ROUTE // MASKED</span></div>}
          <main className="app-main min-h-full p-4 pb-24 lg:p-7">
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="activity" element={<ActivityPage />} />
                <Route path="prospects" element={<ProspectsPage />} />
                <Route path="prospects/new" element={<NewProspectPage />} />
                <Route path="prospects/:id" element={<ProspectDetails />} />
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="replies" element={<RepliesPage />} />
                <Route path="follow-ups" element={<FollowUpsPage />} />
                <Route path="email-drafts" element={<EmailDraftsPage />} />
                <Route path="website-intelligence" element={<WebsiteIntelligencePage />} />
                <Route path="analytics" element={<AnalyticsDashboard />} />
                <Route path="growth-center" element={<GrowthCenterPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon
          const active = item.exact
            ? location.pathname === '/'
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              onClick={closeMore}
              className={`mobile-nav-item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
        <button
          type="button"
          className={`mobile-nav-item ${moreOpen || moreRouteIsActive ? 'is-active' : ''}`}
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-panel"
        >
          <MoreHorizontal size={22} strokeWidth={2.2} />
          <span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <div className="mobile-more-backdrop" role="presentation" onClick={closeMore}>
          <section
            ref={morePanelRef}
            id="mobile-more-panel"
            className="mobile-more-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-more-header">
              <div>
                <span className="mobile-more-eyebrow">ARLOTECH WORKSPACE</span>
                <h2 id="mobile-more-title">Everything in one place</h2>
              </div>
              <button type="button" onClick={closeMore} aria-label="Close more menu"><X size={22} /></button>
            </div>
            <div className="mobile-more-search-hint">
              <ClipboardList size={17} />
              <span>Explore your workspace tools</span>
            </div>
            {mobileMoreGroups.map((group) => (
              <div className="mobile-more-group" key={group.title}>
                <h3>{group.title}</h3>
                <div className="mobile-more-grid">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={closeMore}
                        className={`mobile-more-card ${active ? 'is-active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="mobile-more-icon"><Icon size={22} /></span>
                        <span>{item.label}</span>
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/unsubscribe"
            element={
              <Suspense fallback={<PageLoading />}>
                <UnsubscribePage />
              </Suspense>
            }
          />
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