import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/pickleball/app', label: 'Dashboard', end: true },
  { to: '/pickleball/app/players', label: 'Players' },
  { to: '/pickleball/app/venues', label: 'Venues' },
  { to: '/pickleball/app/sessions', label: 'Sessions' },
]

export default function AppShell({ session, organizations, onSwitchOrg, onLogout }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <p className="mb-4 text-sm font-semibold text-slate-900">Devlab Pickleball</p>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${isActive ? 'bg-brand/10 font-semibold text-brand' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {organizations.length > 1 && (
          <select
            className="mt-6 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={session.activeOrgId}
            onChange={(event) => onSwitchOrg(event.target.value)}
          >
            {organizations.map((org) => (
              <option key={org.organizationId} value={org.organizationId}>
                {org.organizationId}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={onLogout} className="mt-6 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet context={{ authRole: session.role }} />
      </main>
    </div>
  )
}
