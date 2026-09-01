import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import { canCheckIn, canSetAvailability, canLeaveSession, canCancelRegistration } from '../../lib/pickleball/attendance'
import PlayerStatusChip from '../components/PlayerStatusChip'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'
import { Search, UserCheck, LogOut } from '../../components/icons/icons'

export default function CheckInPage() {
  const { sessionId } = useOutletContext()
  const [sessionPlayers, setSessionPlayers] = useState([])
  const [counts, setCounts] = useState(null)
  const [orgPlayers, setOrgPlayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState(null)
  const [selectedNewPlayerId, setSelectedNewPlayerId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  async function reload() {
    const [sessionData, orgData] = await Promise.all([
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/players`),
      pickleballApi.get('/api/pickleball/players'),
    ])
    setSessionPlayers(sessionData.players)
    setCounts(sessionData.counts)
    setOrgPlayers(orgData.players)
    setStatus('ready')
  }

  useEffect(() => {
    let ignore = false
    reload().catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const registeredPlayerIds = new Set(
    sessionPlayers.filter((p) => p.registrationStatus === 'REGISTERED').map((p) => p.playerId)
  )
  const registerableOrgPlayers = orgPlayers.filter((p) => p.active && !registeredPlayerIds.has(p.id))

  // Client-side filter over the already-fetched roster -- no new API call.
  // "Check All"/"Uncheck All" act on this same filtered set, so a facilitator
  // can narrow to e.g. one team and bulk-act on just those rows.
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredPlayers = normalizedQuery
    ? sessionPlayers.filter((player) => player.displayName.toLowerCase().includes(normalizedQuery))
    : sessionPlayers

  const checkInEligiblePlayerIds = filteredPlayers.filter(canCheckIn).map((player) => player.playerId)
  const leaveEligiblePlayerIds = filteredPlayers.filter(canLeaveSession).map((player) => player.playerId)

  async function runAction(actionPromise, onSuccess) {
    setMessage(null)
    try {
      const result = await actionPromise
      await reload()
      if (onSuccess) onSuccess(result)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  function pluralize(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`
  }

  function handleCheckAll() {
    if (!checkInEligiblePlayerIds.length) return
    runAction(
      pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/check-in-bulk`, { playerIds: checkInEligiblePlayerIds }),
      (result) => setMessage({ type: 'success', text: `Checked in ${pluralize(result.checkedInPlayerIds.length, 'player')}.` })
    )
  }

  async function handleUncheckAll() {
    if (!leaveEligiblePlayerIds.length) return
    // There is no bulk-leave endpoint (only check-in-bulk exists), so this
    // composes the same per-player `leave` request the individual "Leave"
    // button below already makes, one call per eligible player. Unlike
    // `runAction` (built around a single all-or-nothing promise), these N
    // calls are independent: some can succeed on the server while others
    // fail (e.g. a 409 from a stale row). We use Promise.allSettled instead
    // of Promise.all so one failing call can't hide the others' success,
    // reload the roster unconditionally so the screen always reflects
    // actual server state, and report the real success/failure counts
    // instead of a single generic message.
    setMessage(null)
    const results = await Promise.allSettled(
      leaveEligiblePlayerIds.map((playerId) =>
        pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/leave`, { playerId })
      )
    )
    const succeededCount = results.filter((result) => result.status === 'fulfilled').length
    const failedCount = results.length - succeededCount

    try {
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: `Removed check-in for ${succeededCount} of ${results.length} players, but could not refresh the roster: ${error.message}` })
      return
    }

    if (failedCount === 0) {
      setMessage({ type: 'success', text: `Removed check-in for ${pluralize(succeededCount, 'player')}.` })
    } else if (succeededCount === 0) {
      setMessage({ type: 'error', text: `Failed to remove check-in for ${pluralize(failedCount, 'player')}.` })
    } else {
      setMessage({
        type: 'error',
        text: `Removed check-in for ${succeededCount} of ${results.length} players; ${pluralize(failedCount, 'player')} failed to leave.`,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Check-in</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        {counts ? (
          <p className="text-sm font-medium text-slate-500" data-testid="attendance-counts">
            {counts.checkedIn} checked in / {counts.registered} registered
          </p>
        ) : null}
      </div>

      {status === 'loading' ? (
        <SkeletonBlock>
          <SkeletonRows rows={5} />
        </SkeletonBlock>
      ) : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load check-in data.</p> : null}
      {message ? (
        <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p>
      ) : null}

      <div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <select
          value={selectedNewPlayerId}
          onChange={(event) => setSelectedNewPlayerId(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          data-testid="register-player-select"
        >
          <option value="">Register a player…</option>
          {registerableOrgPlayers.map((p) => (
            <option key={p.id} value={p.id}>{p.displayName}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selectedNewPlayerId}
          onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players`, { playerId: selectedNewPlayerId }), () => setSelectedNewPlayerId(''))}
          className="pb-btn-primary shrink-0 rounded-lg px-4 py-2 text-sm"
        >
          Register
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search players…"
            aria-label="Search players"
            data-testid="checkin-search"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={handleCheckAll}
            disabled={!checkInEligiblePlayerIds.length}
            data-testid="checkin-check-all"
            className="pb-btn-primary flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed"
          >
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Check all
          </button>
          <button
            type="button"
            onClick={handleUncheckAll}
            disabled={!leaveEligiblePlayerIds.length}
            data-testid="checkin-uncheck-all"
            className="flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Uncheck all
          </button>
        </div>
      </div>

      <div className="space-y-2" data-testid="checkin-list">
        {filteredPlayers.map((player) => (
          <div key={player.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="min-w-[10rem] font-semibold text-slate-900">{player.displayName}</span>
            <span className="text-slate-500">{player.attendanceStatus}</span>
            <PlayerStatusChip status={player.attendanceStatus} />
            {player.attendanceStatus === 'CHECKED_IN' ? (
              <PlayerStatusChip status={player.availabilityStatus} />
            ) : null}
            <div className="ml-auto flex gap-2">
              {canCheckIn(player) ? (
                <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { playerId: player.playerId }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                  Check in
                </button>
              ) : null}
              {canCancelRegistration(player) ? (
                <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/cancel`, { playerId: player.playerId }))} className="rounded border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                  Cancel
                </button>
              ) : null}
              {canSetAvailability(player) ? (
                player.availabilityStatus !== 'AVAILABLE' ? (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/availability`, { playerId: player.playerId, status: 'AVAILABLE' }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                    Set available
                  </button>
                ) : (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/availability`, { playerId: player.playerId, status: 'TEMPORARILY_UNAVAILABLE' }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                    Set unavailable
                  </button>
                )
              ) : null}
              {canLeaveSession(player) ? (
                <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/leave`, { playerId: player.playerId }))} className="rounded border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                  Leave
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {!filteredPlayers.length && status === 'ready' && sessionPlayers.length ? (
          <EmptyState title="No players match your search." compact />
        ) : null}
        {!sessionPlayers.length && status === 'ready' ? (
          <EmptyState title="No players registered yet." description="Register a player above to add them to this session." />
        ) : null}
      </div>
    </div>
  )
}
