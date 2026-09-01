import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

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
  if (!sessions || !players) return <p className="text-sm text-slate-500">Loading…</p>

  const liveSessions = sessions.filter((session) => session.status === 'LIVE' || session.status === 'PAUSED')
  const upcomingSessions = sessions.filter((session) => session.status === 'DRAFT' || session.status === 'OPEN_FOR_CHECKIN')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Dashboard</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="pb-rule absolute inset-x-0 top-0 h-1 w-full rounded-none" />
          <p className="pb-eyebrow text-xs font-bold uppercase tracking-wider text-slate-500">Live sessions</p>
          <p className="pb-score mt-1 text-3xl text-slate-900">{liveSessions.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="pb-rule absolute inset-x-0 top-0 h-1 w-full rounded-none" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Upcoming sessions</p>
          <p className="pb-score mt-1 text-3xl text-slate-900">{upcomingSessions.length}</p>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="pb-rule absolute inset-x-0 top-0 h-1 w-full rounded-none" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Players</p>
          <p className="pb-score mt-1 text-3xl text-slate-900">{players.length}</p>
        </div>
      </div>

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
          {!liveSessions.length ? <p className="text-sm text-slate-500">No sessions are live right now.</p> : null}
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
          {!upcomingSessions.length ? <p className="text-sm text-slate-500">No upcoming sessions.</p> : null}
        </div>
      </div>

      {authRole === 'ADMIN' || isPlatformAdmin ? (
        <div className="flex gap-3">
          <Link to="/pickleball/app/operators" className="text-sm font-semibold text-brand hover:underline">Manage operators</Link>
          <Link to="/pickleball/app/audit" className="text-sm font-semibold text-brand hover:underline">View audit log</Link>
        </div>
      ) : null}
    </div>
  )
}
