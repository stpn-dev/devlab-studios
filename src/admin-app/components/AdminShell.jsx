import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { brandingAssets } from '../../config/branding'
import AdminVectorField from './AdminVectorField'
import { PRIMARY_PUBLIC_SURFACES, SUPPORTING_PUBLIC_SURFACES } from '../../config/publicSurfaces'
import {
  BadgeCheck,
  Briefcase,
  FileText,
  FolderOpen,
  Home,
  Image,
  Link2,
  Mail,
  Menu,
  Search,
  Settings,
} from '../../components/icons/icons'

const NAV_GROUPS = [
  {
    items: [{ label: 'Dashboard', to: '/admin', icon: Home }],
  },
  {
    heading: 'Public Pages',
    items: PRIMARY_PUBLIC_SURFACES.map(({ label, adminPath: to, icon }) => ({ label, to, icon })),
  },
  {
    heading: 'Supporting Content',
    items: SUPPORTING_PUBLIC_SURFACES.map(({ label, adminPath: to, icon }) => ({ label, to, icon })),
  },
  {
    heading: 'Content Libraries',
    items: [
      { label: 'Projects', to: '/admin/content/projects', icon: Briefcase },
      { label: 'Service Catalog', to: '/admin/content/services', icon: Settings },
      { label: 'Insight Articles', to: '/admin/content/resources', icon: FileText },
      { label: 'Certifications', to: '/admin/collections/certifications', icon: BadgeCheck },
    ],
  },
  {
    heading: 'Site Management',
    items: [
      { label: 'Navigation & Footer', to: '/admin/content/site-settings', icon: Settings },
      { label: 'SEO', to: '/admin/content/seo', icon: Search },
      { label: 'Media', to: '/admin/media', icon: Image },
      { label: 'Redirects', to: '/admin/collections/redirects', icon: Link2 },
      { label: 'Audit Log', to: '/admin/audit-log', icon: FolderOpen },
    ],
  },
  {
    heading: 'Operations',
    items: [{ label: 'Leads', to: '/admin/leads', icon: Mail }],
  },
]

function getEnvironmentLabel() {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return { label: 'Local', tone: 'bg-slate-200 text-slate-700' }
  if (hostname === 'www.devlabstudios.com' || hostname === 'devlabstudios.com') return { label: 'Production', tone: 'bg-rose-100 text-rose-700' }
  return { label: 'Preview', tone: 'bg-amber-100 text-amber-700' }
}

function AdminShell({ session, onLogout }) {
  const env = getEnvironmentLabel()
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const navigation = (
    <>
      <div className="flex h-16 flex-shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <img src={brandingAssets.logoOnlyUrl} alt="DevLab Studios" className="h-8 w-8 rounded object-contain" />
        <span className="text-sm font-semibold text-white">DevLab Studios CMS</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.heading || index}>
            {group.heading ? <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{group.heading}</p> : null}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    onClick={() => setIsMobileOpen(false)}
                    className={({ isActive }) =>
                      `admin-nav-link flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition ${isActive ? 'admin-nav-link--active text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.7} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  )

  return (
    <div className="flex min-h-screen bg-[#f5f6fc] text-slate-900">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#080a18] md:flex">
        {navigation}
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close admin navigation" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-[#080a18] shadow-2xl">{navigation}</aside>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsMobileOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 md:hidden" aria-label="Open admin navigation"><Menu className="h-5 w-5" /></button>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${env.tone}`}>{env.label}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/" target="_blank" rel="noreferrer" className="hidden font-medium text-slate-600 transition hover:text-brand-teal sm:inline">Preview Site</a>
            <span className="hidden text-slate-500 lg:inline">{session.email}</span>
            <button type="button" onClick={onLogout} className="font-semibold text-brand-teal hover:underline">
              Log Out
            </button>
          </div>
        </header>
        <main className="admin-workspace relative isolate flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <AdminVectorField />
          <div className="relative z-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminShell
