import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileText,
  Globe,
  Mail,
  MessageCircle,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plane,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  label: string
  icon: React.ElementType
  path: string
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Prospects', icon: Users, path: '/prospects' },
  { label: 'Website Analysis', icon: Globe, path: '/website-intelligence' },
  { label: 'Campaigns', icon: FileText, path: '/campaigns' },
  { label: 'Email Drafts', icon: Mail, path: '/email-drafts' },
  { label: 'Replies', icon: MessageCircle, path: '/replies' },
  { label: 'Follow-ups', icon: Plane, path: '/follow-ups' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { label: 'Settings', icon: Settings, path: '/settings' },
]

export function Sidebar({
  mobileOpen,
  setMobileOpen,
  onNavigate,
}: {
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  onNavigate: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const { signOut } = useAuth()

  const toggleCollapse = () => setCollapsed((v) => !v)

  useEffect(() => {
    if (!mobileOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen, setMobileOpen])

  const handleSignOut = async () => {
    setSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      onNavigate()
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <>
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-all duration-300 lg:relative lg:inset-y-auto lg:left-auto lg:translate-x-0 ${
          collapsed ? 'lg:w-20' : 'lg:w-64'
        } ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className={`text-sm font-bold text-slate-800 ${collapsed ? 'lg:hidden' : ''}`}>
              ArloTech
            </span>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <div key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    collapsed ? 'lg:justify-center' : 'justify-start'
                  } ${
                    isActive
                      ? 'bg-arlotech text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
                onClick={() => {
                  onNavigate()
                  setMobileOpen(false)
                }}
              >
                <item.icon className="h-4 w-4" />
                <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
              </NavLink>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200">
          {signOutError && (
            <p className="mb-2 text-xs text-red-600" role="alert">
              {signOutError}
            </p>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4" />
            <span className={collapsed ? 'lg:hidden' : ''}>{signingOut ? 'Logging out...' : 'Log out'}</span>
          </button>
        </div>

        <button
          type="button"
          className="absolute -right-3 top-16 hidden h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 lg:flex"
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>
    </>
  )
}
