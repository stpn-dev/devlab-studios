import { useEffect, useState } from 'react'
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useSessionRealtime } from '../lib/useSessionRealtime'
import { pickleballApi } from '../lib/pickleballApi'

const SUB_NAV = [
  { to: '', label: 'Overview', end: true },
  { to: 'check-in', label: 'Check-in' },
  { to: 'queue', label: 'Queue' },
  { to: 'courts', label: 'Courts' },
  { to: 'games', label: 'Games' },
  { to: 'leaderboard', label: 'Leaderboard' },
]

// The realtime STATE snapshot's queue entries (buildSessionSnapshot ->
// listQueueForSession) never carry a `reasons` field -- that explainability
// array is only computed by the separate REST route (GET
// /api/pickleball/sessions/[id]/queue), which reruns selectNextPlayers()
// itself. Rather than have every consumer of `snapshot.queue` (QueuePage,
// CourtsPage) know about that split, this hook fetches the REST route
// alongside the WebSocket connection and merges its `reasons` by
// `sessionPlayerId` -- the field both shapes share -- so `snapshot.queue`
// entries carry `reasons` from the caller's point of view exactly as if the
// realtime payload had included them.
//
// Refetches whenever the *set* of queued sessionPlayerIds changes (a new
// join/leave, or a fairness-relevant reshuffle) and on a light 15s interval
// in between, since `reasons` also embeds a live "Queue wait: Nm" minute
// count that drifts with the clock even when the queue itself is
// unchanged. 15s keeps that reasonably fresh without competing with the
// realtime socket as a heavy polling loop.
function useQueueReasons(sessionId, snapshot) {
  const [reasonsBySessionPlayerId, setReasonsBySessionPlayerId] = useState({})

  const queuedIdsKey = snapshot
    ? snapshot.queue
        .filter((entry) => entry.status === 'QUEUED')
        .map((entry) => entry.sessionPlayerId)
        .join(',')
    : ''

  useEffect(() => {
    if (!sessionId || !queuedIdsKey) {
      setReasonsBySessionPlayerId({})
      return undefined
    }

    let cancelled = false

    async function fetchReasons() {
      try {
        const data = await pickleballApi.get(`/api/pickleball/sessions/${sessionId}/queue`)
        if (cancelled) return
        const next = Object.fromEntries((data.queue || []).map((entry) => [entry.sessionPlayerId, entry.reasons || []]))
        setReasonsBySessionPlayerId(next)
      } catch {
        // Non-fatal: the realtime snapshot (positions, counts, assignments)
        // keeps working from the WebSocket regardless -- only the "Why?"
        // explainability extras this fetch adds are affected.
      }
    }

    fetchReasons()
    const interval = setInterval(fetchReasons, 15000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, queuedIdsKey])

  return reasonsBySessionPlayerId
}

export default function SessionLayout() {
  const { sessionId } = useParams()
  const { authRole, activeOrgId, isPlatformAdmin } = useOutletContext()
  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = `${sessionId}:${activeOrgId}`
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setSession(null)
    setLoadError(false)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}`)
      .then((data) => {
        if (!ignore) setSession(data.session)
      })
      .catch(() => {
        if (!ignore) setLoadError(true)
      })
    return () => {
      ignore = true
    }
  }, [sessionId, activeOrgId])

  const wsUrl = `${window.location.origin.replace('http', 'ws')}/pickleball/rt/${sessionId}`
  const { status, snapshot, error } = useSessionRealtime(loadError ? null : wsUrl)
  const reasonsBySessionPlayerId = useQueueReasons(sessionId, snapshot)

  const enrichedSnapshot = snapshot
    ? { ...snapshot, queue: snapshot.queue.map((entry) => ({ ...entry, reasons: reasonsBySessionPlayerId[entry.sessionPlayerId] || [] })) }
    : snapshot

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
            {loadError ? 'Could not load this session.' : session ? session.name : 'Loading…'}
          </h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        {loadError ? null : (
          <span
            data-testid="realtime-status"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
          >
            {status === 'open' ? <span className="pb-live-dot" /> : null}
            {status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
          </span>
        )}
      </div>

      {loadError ? (
        <p className="text-sm text-rose-600">Could not load this session. It may not exist, or you may not have access to it.</p>
      ) : (
        <>
          <nav className="flex gap-1 border-b border-slate-200 pb-2">
            {SUB_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `pb-tab rounded px-3 py-1.5 text-sm ${isActive ? 'pb-tab--active font-semibold text-brand' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Outlet context={{ sessionId, session, status, snapshot: enrichedSnapshot, error, authRole, isPlatformAdmin }} />
        </>
      )}
    </div>
  )
}
