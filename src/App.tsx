import { Toaster } from 'sonner'
import { useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
} from 'react-router-dom'
import { Menu } from 'lucide-react'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/Sidebar'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { NewProspectPage, ProspectsPage } from '@/pages/Prospects'
import { ProspectDetails } from '@/pages/ProspectDetails'
import { CampaignsPage } from '@/pages/Campaigns'
import { RepliesPage } from '@/pages/Replies'
import { FollowUpsPage } from '@/pages/FollowUps'
import { EmailDraftsPage } from '@/pages/EmailDrafts'
import { WebsiteIntelligencePage } from '@/pages/WebsiteIntelligence'
import { AnalyticsDashboard } from '@/pages/Analytics'
import { SettingsPage } from '@/pages/Settings'

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

  const closeSidebar = () => setMobileOpen(false)

  return (
    <div className="flex h-dvh overflow-hidden">
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
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-arlotech"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-controls="app-sidebar"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-800">Arlotech AI</span>
        </header>
        <div className="min-w-0 flex-1 overflow-auto">
          <main className="min-h-full p-4 lg:p-6">
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
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
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