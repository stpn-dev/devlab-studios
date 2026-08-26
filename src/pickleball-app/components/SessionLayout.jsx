import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useSessionRealtime } from '../lib/useSessionRealtime'
import { pickleballApi } from '../lib/pickleballApi'

const SUB_NAV = [
  { to: '', label: 'Overview', end: true },
  { to: 'check-in', label: 'Check-in' },
  { to: 'queue', label: 'Queue' },
  { to: 'courts', label: 'Courts' },
  { to: 'games', label: 'Games' },
]

export default function SessionLayout() {
  const { sessionId } = useParams()
  const [session, setSession] = useState(null)

  useEffect(() => {
    let ignore = false
    pickleballApi.get(`/api/pickleball/sessions/${sessionId}`).then((data) => {
      if (!ignore) setSession(data.session)
    })
    return () => {
      ignore = true
    }
  }, [sessionId])

  const wsUrl = `${window.location.origin.replace('http', 'ws')}/pickleball/rt/${sessionId}`
  const { status, snapshot, error } = useSessionRealtime(wsUrl)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h1 className="text-xl font-semibold text-slate-900">{session ? session.name : 'Loading…'}</h1>
        <span
          data-testid="realtime-status"
          className={`rounded-full px-2 py-1 text-xs font-medium ${status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
        >
          {status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </span>
      </div>

      <nav className="flex gap-1 border-b border-slate-200 pb-2">
        {SUB_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-brand/10 font-semibold text-brand' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ sessionId, session, status, snapshot, error }} />
    </div>
  )
}
