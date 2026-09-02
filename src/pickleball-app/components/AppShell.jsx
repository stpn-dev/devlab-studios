import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { hasPermission } from '../../lib/pickleball/permissions'
import {
  Activity,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  History,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  MapPin,
  Menu,
  Settings,
  ShieldCheck,
  Swords,
  Trophy,
  UserCheck,
  Users,
  X,
} from '../../components/icons/icons'

// A session's own sub-pages (Check-in/Queue/Courts/Games/Leaderboard, see
// SessionLayout.jsx's SUB_NAV) live under /pickleball/app/sessions/:sessionId.
// The sidebar surfaces a "Play" shortcut section to those pages, but only
// while the operator is actually inside a session — otherwise there is no
// sessionId to link to, so the section is omitted entirely rather than
// rendered disabled.
const SESSION_PATH_PATTERN = /^\/pickleball\/app\/sessions\/([^/]+)/
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'pb-sidebar-collapsed'

function getActiveSessionId(pathname) {
  const match = SESSION_PATH_PATTERN.exec(pathname)
  return match ? match[1] : null
}

// Same gated array this shell has always rendered from (`permission`/
// `platformAdminOnly` fields, checked exactly as before) — this function
// only changes how those items are grouped and labeled with icons, per the
// design spec's Component Architecture (Overview/Play/Performance/
// Management/System).
function buildNavSections(activeSessionId) {
  const sessionBase = activeSessionId ? `/pickleball/app/sessions/${activeSessionId}` : null

  return [
    {
      key: 'overview',
      heading: 'Overview',
      items: [{ to: '/pickleball/app', label: 'Dashboard', icon: LayoutDashboard, end: true }],
    },
    sessionBase && {
      key: 'play',
      heading: 'Play',
      items: [
        { to: sessionBase, label: 'Active Session', icon: Activity, end: true },
        { to: `${sessionBase}/check-in`, label: 'Check-In', icon: UserCheck },
        { to: `${sessionBase}/queue`, label: 'Queue', icon: ListOrdered },
        { to: `${sessionBase}/courts`, label: 'Courts', icon: Grid3x3 },
        { to: `${sessionBase}/games`, label: 'Games', icon: Swords },
      ],
    },
    {
      key: 'performance',
      heading: 'Performance',
      items: [
        sessionBase && { to: `${sessionBase}/leaderboard`, label: 'Leaderboard', icon: Trophy },
        { to: '/pickleball/app/players', label: 'Players', icon: Users },
      ].filter(Boolean),
    },
    {
      key: 'management',
      heading: 'Management',
      items: [
        { to: '/pickleball/app/sessions', label: 'Sessions', icon: Calendar },
        { to: '/pickleball/app/venues', label: 'Venues', icon: MapPin },
        { to: '/pickleball/app/operators', label: 'Operators', icon: ShieldCheck, permission: 'MANAGE_OPERATORS' },
      ],
    },
    {
      key: 'system',
      heading: 'System',
      items: [
        { to: '/pickleball/app/settings', label: 'Settings', icon: Settings, permission: 'CONFIGURE_SYSTEM_DEFAULTS' },
        { to: '/pickleball/app/audit', label: 'Audit Log', icon: History, permission: 'VIEW_AUDIT_LOG' },
        { to: '/pickleball/app/platform', label: 'Platform', icon: Building2, platformAdminOnly: true },
      ],
    },
  ].filter(Boolean)
}

function filterVisibleSections(sections, session) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => (!item.permission || hasPermission(session, item.permission)) && (!item.platformAdminOnly || session.isPlatformAdmin),
      ),
    }))
    .filter((section) => section.items.length > 0)
}

function NavSections({ sections, collapsed, onNavigate }) {
  return (
    // `overflow-y-auto` only applies while expanded: with a single non-`visible`
    // overflow axis, the CSS Overflow spec forces the OTHER axis to `auto` too
    // (there is no standards-compliant way to keep one axis scrollable and the
    // other genuinely visible on the same box), so whenever this nav has any
    // overflow value it also clips horizontally -- silently eating the
    // collapsed-sidebar tooltip (`.pb-nav-tooltip`, positioned via
    // `left: calc(100% + 0.5rem)` off a `.pb-nav-link` ancestor here) before a
    // sighted/keyboard user ever sees it. Expanded nav items render no
    // tooltip at all (see the `collapsed ?` guard below), so keeping the
    // scroll affordance there is free; collapsed mode's icon-only rows are
    // short enough in practice not to need it.
    <nav className={`flex-1 space-y-5 px-2.5 py-4 ${collapsed ? '' : 'overflow-y-auto'}`}>
      {sections.map((section) => (
        <div key={section.key}>
          {!collapsed ? <p className="pb-eyebrow mb-1.5 px-2.5 text-[color:var(--text-on-dark-muted)]">{section.heading}</p> : null}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon
              // Only needed (and only unique) while collapsed -- the tooltip
              // itself is only rendered in that state, so this id doesn't
              // need to survive the expanded/collapsed toggle.
              const tooltipId = collapsed ? `pb-nav-tooltip-${item.to.replace(/[^a-zA-Z0-9]/g, '-')}` : undefined
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  aria-describedby={tooltipId}
                  className={({ isActive }) =>
                    `pb-nav-link pb-focus-on-dark group flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-sm ${isActive ? 'pb-nav-link--active' : ''} ${
                      collapsed ? 'justify-center' : ''
                    }`
                  }
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span className={collapsed ? 'sr-only' : ''}>{item.label}</span>
                  {collapsed ? (
                    <span id={tooltipId} className="pb-nav-tooltip" role="tooltip">
                      {item.label}
                    </span>
                  ) : null}
                </NavLink>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({ organizations, session, onSwitchOrg, onLogout, collapsed }) {
  return (
    <div className="flex-shrink-0 space-y-1.5 border-t border-white/10 px-2.5 py-3">
      {!collapsed && organizations.length > 1 ? (
        <select
          className="pb-focus-on-dark min-h-11 w-full rounded-lg border border-white/15 bg-white/5 px-2 text-sm text-white"
          value={session.activeOrgId}
          onChange={(event) => onSwitchOrg(event.target.value)}
        >
          {organizations.map((org) => (
            <option key={org.organizationId} value={org.organizationId} className="text-slate-900">
              {org.organizationId}
            </option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        onClick={onLogout}
        className={`pb-focus-on-dark flex min-h-11 w-full items-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className={collapsed ? 'sr-only' : ''}>Sign out</span>
      </button>
    </div>
  )
}

function SidebarBrand({ collapsed }) {
  return (
    <div className={`flex h-16 flex-shrink-0 items-center px-4 ${collapsed ? 'justify-center px-0' : 'gap-2'}`}>
      {collapsed ? (
        <span className="pb-rule h-8 w-2 rounded-full" aria-hidden="true" />
      ) : (
        <div>
          <p className="text-sm font-extrabold tracking-tight text-white">Devlab Pickleball</p>
          <div className="pb-rule mt-1 h-[3px] w-11 rounded-full" />
        </div>
      )}
    </div>
  )
}

export default function AppShell({ session, organizations, onSwitchOrg, onLogout }) {
  const location = useLocation()
  const activeSessionId = useMemo(() => getActiveSessionId(location.pathname), [location.pathname])
  const navSections = useMemo(() => filterVisibleSections(buildNavSections(activeSessionId), session), [activeSessionId, session])

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const mobileDrawerRef = useRef(null)
  const mobileCloseButtonRef = useRef(null)

  // Route changes are one of the three ways the brief requires the mobile
  // drawer to close (backdrop click, close button, or route change).
  useEffect(() => {
    function closeDrawer() {
      setIsMobileNavOpen(false)
    }
    closeDrawer()
  }, [location.pathname])

  // Move focus into the drawer as soon as it opens -- without this, focus
  // stays on the (now off-screen/backdrop-covered) trigger button that
  // opened it, which is both invisible to a sighted user and unreachable by
  // keyboard until they tab all the way back to where they started.
  useEffect(() => {
    if (isMobileNavOpen) {
      mobileCloseButtonRef.current?.focus()
    }
  }, [isMobileNavOpen])

  // Escape-to-close plus a simple manual focus trap: while the drawer is
  // open, Tab/Shift+Tab wrap between its first and last focusable elements
  // instead of walking out into the backdrop-covered main content behind it.
  useEffect(() => {
    if (!isMobileNavOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false)
        return
      }
      if (event.key !== 'Tab' || !mobileDrawerRef.current) return

      const focusable = mobileDrawerRef.current.querySelectorAll(
        'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMobileNavOpen])

  function toggleCollapsed() {
    setIsCollapsed((wasCollapsed) => {
      const nextCollapsed = !wasCollapsed
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(nextCollapsed))
      } catch {
        // Storage may be unavailable (private browsing, disabled site data) —
        // the toggle still works for this session, it just won't persist.
      }
      return nextCollapsed
    })
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="pb-sidebar flex h-14 flex-shrink-0 items-center gap-3 px-4 md:hidden">
        <button
          type="button"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="Open navigation"
          data-testid="mobile-nav-trigger"
          className="pb-focus-on-dark inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="text-sm font-extrabold tracking-tight text-white">Devlab Pickleball</p>
      </header>

      <aside
        className={`pb-sidebar relative hidden flex-shrink-0 flex-col transition-[width] duration-200 motion-reduce:transition-none md:flex ${
          isCollapsed ? 'w-[4.5rem]' : 'w-60'
        }`}
      >
        <SidebarBrand collapsed={isCollapsed} />
        <NavSections sections={navSections} collapsed={isCollapsed} />
        <SidebarFooter organizations={organizations} session={session} onSwitchOrg={onSwitchOrg} onLogout={onLogout} collapsed={isCollapsed} />
        <button
          type="button"
          onClick={toggleCollapsed}
          data-testid="sidebar-collapse-toggle"
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="pb-focus-on-dark flex min-h-11 flex-shrink-0 items-center justify-center gap-2 border-t border-white/10 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronLeft className="h-4 w-4" aria-hidden="true" />}
          {isCollapsed ? null : 'Collapse'}
        </button>
      </aside>

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            data-testid="mobile-nav-backdrop"
            className="pb-drawer-backdrop absolute inset-0"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <aside
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="pb-sidebar relative flex h-full w-72 max-w-[85vw] flex-col shadow-2xl"
            data-testid="mobile-nav-drawer"
          >
            <div className="flex h-16 flex-shrink-0 items-center justify-between px-4">
              <div>
                <p className="text-sm font-extrabold tracking-tight text-white">Devlab Pickleball</p>
                <div className="pb-rule mt-1 h-[3px] w-11 rounded-full" />
              </div>
              <button
                ref={mobileCloseButtonRef}
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                aria-label="Close navigation"
                className="pb-focus-on-dark inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <NavSections sections={navSections} collapsed={false} onNavigate={() => setIsMobileNavOpen(false)} />
            <SidebarFooter organizations={organizations} session={session} onSwitchOrg={onSwitchOrg} onLogout={onLogout} collapsed={false} />
          </aside>
        </div>
      ) : null}

      <main className="pb-mesh-bg flex-1 overflow-y-auto p-4 sm:p-6">
        <Outlet context={{ authRole: session.role, activeOrgId: session.activeOrgId, isPlatformAdmin: session.isPlatformAdmin }} />
      </main>
    </div>
  )
}
