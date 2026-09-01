import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import MetricCard from '../components/MetricCard'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonLine, SkeletonMetricCard, SkeletonRows } from '../components/SkeletonLoader'
import PickleballHeroGraphic from '../components/illustrations/PickleballHeroGraphic'
import { Activity, Clock, Users } from '../../components/icons/icons'

// Local-time greeting for the dashboard hero -- takes the hour as a plain
// argument (rather than reading `Date` internally) so it stays a pure,
// trivially-testable function.
function getGreeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const { authRole, activeOrgId, isPlatformAdmin } = useOutletContext()
  const [sessions, setSessions] = useState(null)
  const [players, setPlayers] = useState(null)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  // Switching org (PickleballApp's handleSwitchOrg) does not remount this
  // component: it re-renders PickleballApp with a fresh session/organizations
  // state and calls buildRouter() again, but RouterProvider's own route-match
  // rendering is positional (RenderedRoute elements carry no `key`), so React
  // reconciles DashboardPage's fiber -- and its state -- across the new
  // `router` object identity rather than tearing it down. Reset on activeOrgId
  // explicitly, the same pattern OperatorsPage/AuditPage use, so switching org
  // while sitting on the dashboard doesn't leave the previous org's sessions
  // and players on screen.
  if (fetchKey !== activeOrgId) {
    setFetchKey(activeOrgId)
    setSessions(null)
    setPlayers(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    Promise.all([pickleballApi.get('/api/pickleball/sessions'), pickleballApi.get('/api/pickleball/players')])
      .then(([sessionsData, playersData]) => {
        if (!ignore) {
          setSessions(sessionsData.sessions)
          setPlayers(playersData.players)
        }
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [activeOrgId])

  if (message) return <p className="text-sm text-rose-600">{message.text}</p>

  // Loading state keeps the header shell in place (Step 4: no drastic
  // layout shift) -- the greeting itself needs no fetched data at all
  // (only the browser's clock), only the hero/metric/session sections below
  // it depend on `sessions`/`players` actually arriving.
  const loading = !sessions || !players
  const liveSessions = loading ? [] : sessions.filter((session) => session.status === 'LIVE' || session.status === 'PAUSED')
  const upcomingSessions = loading ? [] : sessions.filter((session) => session.status === 'DRAFT' || session.status === 'OPEN_FOR_CHECKIN')

  // The hero surfaces one session: whichever is actually live right now, or
  // otherwise the soonest upcoming one. `upcomingSessions` inherits the
  // sessions API's own `ORDER BY scheduled_start DESC`, so it's re-sorted
  // ascending here rather than just taking its first entry.
  const nextSession = liveSessions.length
    ? null
    : [...upcomingSessions].sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart))[0] ?? null
  const heroSession = liveSessions[0] ?? nextSession

  return (
    <div className="space-y-6">
      <div>
        <p className="pb-eyebrow">Overview</p>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{getGreeting(new Date().getHours())}</h1>
            {loading ? (
              <SkeletonBlock>
                <SkeletonLine className="mt-2 h-4 w-56" />
              </SkeletonBlock>
            ) : heroSession ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>{liveSessions.length ? 'Live now:' : 'Next up:'}</span>
                <span className="font-semibold text-slate-900">{heroSession.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{heroSession.status}</span>
              </p>
            ) : (
              <div className="mt-2 w-full max-w-md">
                <EmptyState
                  title="No live or upcoming sessions right now."
                  description="Sessions you schedule will show up here."
                  illustration={PickleballHeroGraphic}
                  action={{ label: 'View sessions', to: '/pickleball/app/sessions' }}
                />
              </div>
            )}
          </div>
          {heroSession ? (
            <Link
              to={`/pickleball/app/sessions/${heroSession.id}`}
              className="pb-btn-primary inline-flex flex-shrink-0 items-center rounded-lg px-4 py-2 text-sm"
            >
              Manage Session
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <SkeletonBlock>
          <div className="grid gap-4 sm:grid-cols-3">
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
          </div>
          <div className="mt-6">
            <SkeletonRows rows={3} />
          </div>
        </SkeletonBlock>
      ) : (
        <>
          {/* Org-wide counts -- the current dashboard fetch (sessions + players)
              has no per-session registered/checked-in/queued/playing breakdown
              for the hero session, so these three tiles reuse the same real
              counts the page already computed above rather than fabricating a
              metric this fetch doesn't provide. See task-2-report.md for the gap. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={Activity} label="Live sessions" value={liveSessions.length} />
            <MetricCard icon={Clock} label="Upcoming sessions" value={upcomingSessions.length} />
            <MetricCard icon={Users} label="Players" value={players.length} />
          </div>

          <div>
            <p className="pb-eyebrow">Sessions</p>
            <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />

            <div className="mt-3 space-y-5">
              <div>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Live now</h2>
                <div className="space-y-2" data-testid="dashboard-live-sessions">
                  {liveSessions.map((session) => (
                    <Link
                      key={session.id}
                      to={`/pickleball/app/sessions/${session.id}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm hover:border-brand/40"
                    >
                      <span className="pb-live-dot" />
                      <span className="font-semibold text-slate-900">{session.name}</span>
                      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{session.status}</span>
                    </Link>
                  ))}
                  {!liveSessions.length ? <EmptyState title="No sessions are live right now." compact /> : null}
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Upcoming</h2>
                <div className="space-y-2" data-testid="dashboard-upcoming-sessions">
                  {upcomingSessions.map((session) => (
                    <Link
                      key={session.id}
                      to={`/pickleball/app/sessions/${session.id}`}
                      className="flex items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm hover:border-brand/40"
                    >
                      <span className="font-semibold text-slate-900">{session.name}</span>
                      <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{session.status}</span>
                    </Link>
                  ))}
                  {!upcomingSessions.length ? <EmptyState title="No upcoming sessions." compact /> : null}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {authRole === 'ADMIN' || isPlatformAdmin ? (
        <div className="flex gap-3">
          <Link to="/pickleball/app/operators" className="text-sm font-semibold text-brand hover:underline">Manage operators</Link>
          <Link to="/pickleball/app/audit" className="text-sm font-semibold text-brand hover:underline">View audit log</Link>
        </div>
      ) : null}
    </div>
  )
}
