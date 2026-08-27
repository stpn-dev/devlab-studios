import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function DashboardPage() {
  const { authRole, activeOrgId } = useOutletContext()
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
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-slate-500">Live sessions</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{liveSessions.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-slate-500">Upcoming sessions</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{upcomingSessions.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase text-slate-500">Players</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{players.length}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Live now</h2>
        <div className="space-y-2" data-testid="dashboard-live-sessions">
          {liveSessions.map((session) => (
            <Link
              key={session.id}
              to={`/pickleball/app/sessions/${session.id}`}
              className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-300"
            >
              <span className="font-semibold text-slate-900">{session.name}</span>
              <span className="ml-2 text-slate-500">{session.status}</span>
            </Link>
          ))}
          {!liveSessions.length ? <p className="text-sm text-slate-500">No sessions are live right now.</p> : null}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Upcoming</h2>
        <div className="space-y-2" data-testid="dashboard-upcoming-sessions">
          {upcomingSessions.map((session) => (
            <Link
              key={session.id}
              to={`/pickleball/app/sessions/${session.id}`}
              className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-300"
            >
              <span className="font-semibold text-slate-900">{session.name}</span>
              <span className="ml-2 text-slate-500">{session.status}</span>
            </Link>
          ))}
          {!upcomingSessions.length ? <p className="text-sm text-slate-500">No upcoming sessions.</p> : null}
        </div>
      </div>

      {authRole === 'ADMIN' ? (
        <div className="flex gap-3">
          <Link to="/pickleball/app/operators" className="text-sm font-medium text-brand underline">Manage operators</Link>
          <Link to="/pickleball/app/audit" className="text-sm font-medium text-brand underline">View audit log</Link>
        </div>
      ) : null}
    </div>
  )
}
