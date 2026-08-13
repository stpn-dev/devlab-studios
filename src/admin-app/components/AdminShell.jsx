import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { brandingAssets } from '../../config/branding'
import { Menu } from '../../components/icons/icons'

const NAV_GROUPS = [
  {
    items: [{ label: 'Dashboard', to: '/admin' }],
  },
  {
    heading: 'Pages',
    items: [
      { label: 'Home', to: '/admin/pages/home' },
      { label: 'About', to: '/admin/pages/about' },
      { label: 'Process', to: '/admin/pages/process' },
    ],
  },
  {
    heading: 'Content',
    items: [
      { label: 'Projects', to: '/admin/content/projects' },
      { label: 'Services', to: '/admin/content/services' },
      { label: 'Articles', to: '/admin/content/resources' },
      { label: 'Case Studies', to: '/admin/collections/case-studies' },
      { label: 'Testimonials', to: '/admin/collections/testimonials' },
      { label: 'Certifications', to: '/admin/collections/certifications' },
    ],
  },
  {
    items: [{ label: 'Profile', to: '/admin/content/profile' }],
  },
  {
    heading: 'Site',
    items: [
      { label: 'Site Settings', to: '/admin/content/site-settings' },
      { label: 'SEO', to: '/admin/content/seo' },
    ],
  },
  {
    items: [
      { label: 'Media', to: '/admin/media' },
      { label: 'Redirects', to: '/admin/collections/redirects' },
      { label: 'Audit Log', to: '/admin/audit-log' },
    ],
  },
  {
    heading: 'Operations',
    items: [{ label: 'Leads', to: '/admin/leads' }],
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
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/admin'}
                  onClick={() => setIsMobileOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  )

  return (
    <div className="flex min-h-screen bg-[#f3f5fb] text-slate-900">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-[#080d21] md:flex">
        {navigation}
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close admin navigation" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-[#080d21] shadow-2xl">{navigation}</aside>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsMobileOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 md:hidden" aria-label="Open admin navigation"><Menu className="h-5 w-5" /></button>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${env.tone}`}>{env.label}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-slate-500 sm:inline">{session.email} ({session.mode})</span>
            <button type="button" onClick={onLogout} className="font-semibold text-brand-teal hover:underline">
              Log Out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminShell
