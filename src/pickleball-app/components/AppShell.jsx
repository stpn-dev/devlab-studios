import { NavLink, Outlet } from 'react-router-dom'
import { can } from '../../lib/pickleball/permissions'

const NAV_ITEMS = [
  { to: '/pickleball/app', label: 'Dashboard', end: true },
  { to: '/pickleball/app/players', label: 'Players' },
  { to: '/pickleball/app/venues', label: 'Venues' },
  { to: '/pickleball/app/sessions', label: 'Sessions' },
  { to: '/pickleball/app/operators', label: 'Operators', permission: 'MANAGE_OPERATORS' },
  { to: '/pickleball/app/audit', label: 'Audit Log', permission: 'VIEW_AUDIT_LOG' },
  { to: '/pickleball/app/settings', label: 'Settings', permission: 'CONFIGURE_SYSTEM_DEFAULTS' },
]

export default function AppShell({ session, organizations, onSwitchOrg, onLogout }) {
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.permission || can(session.role, item.permission))

  return (
    <div className="flex min-h-screen">
      <aside className="pb-sidebar w-56 shrink-0 p-4">
        <p className="mb-1 text-sm font-extrabold tracking-tight text-white">Devlab Pickleball</p>
        <div className="pb-rule mb-4 h-[3px] w-11 rounded-full" />
        <nav className="space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `pb-nav-link block rounded-lg px-3 py-2 text-sm ${isActive ? 'pb-nav-link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {organizations.length > 1 && (
          <select
            className="mt-6 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={session.activeOrgId}
            onChange={(event) => onSwitchOrg(event.target.value)}
          >
            {organizations.map((org) => (
              <option key={org.organizationId} value={org.organizationId} className="text-slate-900">
                {org.organizationId}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="mt-6 w-full rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet context={{ authRole: session.role, activeOrgId: session.activeOrgId }} />
      </main>
    </div>
  )
}
