import { useState } from 'react'
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
  Building,
  Plane,
} from 'lucide-react'

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

  const toggleCollapse = () => setCollapsed((v) => !v)

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-arlotech text-white">
              <Building className="h-4 w-4" />
            </div>
            <span className={`text-sm font-bold text-slate-800 ${collapsed ? 'hidden' : 'block'}`}>
              Arlotech AI
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
                    collapsed ? 'justify-center' : 'justify-start'
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
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Log out</span>}
          </button>
        </div>

        <button
          type="button"
          className="absolute -right-3 top-16 lg:top-24 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          onClick={toggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>
    </>
  )
}
