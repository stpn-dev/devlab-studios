import { useEffect, useState } from 'react'
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useSessionRealtime } from '../lib/useSessionRealtime'
import { pickleballApi } from '../lib/pickleballApi'
import { hasPermission } from '../../lib/pickleball/permissions'
import { Pencil, Check, Close } from '../../components/icons/icons'

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
    let cancelled = false

    // The reset-to-empty branch is inside this async function (not called
    // directly at the effect's top level) so a plain sessionId/queue change
    // that empties the queue clears stale reasons through the same async
    // path a real fetch would use, rather than a synchronous setState call
    // in the effect body itself.
    async function fetchReasons() {
      if (!sessionId || !queuedIdsKey) {
        if (!cancelled) setReasonsBySessionPlayerId({})
        return
      }
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
    const interval = queuedIdsKey ? setInterval(fetchReasons, 15000) : null

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
     
  }, [sessionId, queuedIdsKey])

  return reasonsBySessionPlayerId
}

export default function SessionLayout() {
  const { sessionId } = useParams()
  const { authRole, activeOrgId, isPlatformAdmin } = useOutletContext()
  const [session, setSession] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [fetchKey, setFetchKey] = useState(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState(null)
  const [savingName, setSavingName] = useState(false)

  const canManageSessions = hasPermission({ role: authRole, isPlatformAdmin }, 'MANAGE_SESSIONS')

  function startEditingName() {
    setNameDraft(session.name)
    setNameError(null)
    setIsEditingName(true)
  }

  async function saveName() {
    setSavingName(true)
    setNameError(null)
    try {
      const result = await pickleballApi.patch(`/api/pickleball/sessions/${sessionId}`, { name: nameDraft })
      setSession(result.session)
      setIsEditingName(false)
    } catch (error) {
      setNameError(error.message)
    } finally {
      setSavingName(false)
    }
  }

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
          {!loadError && session && isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                autoFocus
                maxLength={160}
                className="rounded border border-slate-300 px-2 py-1 text-xl font-extrabold tracking-tight text-slate-900"
              />
              <button
                type="button"
                disabled={savingName}
                onClick={saveName}
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-300 text-emerald-700 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Save session name"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={savingName}
                onClick={() => setIsEditingName(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Cancel editing session name"
              >
                <Close className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                {loadError ? 'Could not load this session.' : session ? session.name : 'Loading…'}
              </h1>
              {!loadError && session && canManageSessions ? (
                <button
                  type="button"
                  onClick={startEditingName}
                  className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Edit session name"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )}
          {nameError ? <p className="text-sm text-rose-600">{nameError}</p> : null}
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        {loadError ? null : (
          <span
            data-testid="realtime-status"
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
          >
            {status === 'open' ? <span className="pb-live-dot" /> : null}
            {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
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
                  `pb-tab inline-flex min-h-11 items-center rounded px-3 text-sm ${isActive ? 'pb-tab--active font-semibold text-brand' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Outlet context={{ sessionId, session, status, snapshot: enrichedSnapshot, error, authRole, isPlatformAdmin, onSessionUpdated: setSession }} />
        </>
      )}
    </div>
  )
}
