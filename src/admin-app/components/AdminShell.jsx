import { NavLink, Outlet } from 'react-router-dom'
import { brandingAssets } from '../../config/branding'

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
]

function getEnvironmentLabel() {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return { label: 'Local', tone: 'bg-slate-200 text-slate-700' }
  if (hostname === 'www.devlabstudios.com' || hostname === 'devlabstudios.com') return { label: 'Production', tone: 'bg-rose-100 text-rose-700' }
  return { label: 'Preview', tone: 'bg-amber-100 text-amber-700' }
}

function AdminShell({ session, onLogout }) {
  const env = getEnvironmentLabel()

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
          <img src={brandingAssets.logoOnlyUrl} alt="DevLab Studios" className="h-8 w-8 rounded object-contain" />
          <span className="text-sm font-semibold">DevLab Studios CMS</span>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.heading || index}>
              {group.heading ? <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.heading}</p> : null}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin'}
                    className={({ isActive }) =>
                      `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-mint/50 text-brand-ink' : 'text-slate-600 hover:bg-slate-50'}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${env.tone}`}>{env.label}</span>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{session.email} ({session.mode})</span>
            <button type="button" onClick={onLogout} className="font-semibold text-brand-teal hover:underline">
              Log Out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminShell
