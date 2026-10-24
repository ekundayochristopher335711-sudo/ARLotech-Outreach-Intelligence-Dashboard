import { useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
} from 'react-router-dom'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/Sidebar'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { ProspectsPage } from '@/pages/Prospects'
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onNavigate={closeSidebar}
      />
      <div className="flex-1 overflow-auto">
        <main className="p-4 lg:p-6">
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="prospects" element={<ProspectsPage />} />
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
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppShell />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}