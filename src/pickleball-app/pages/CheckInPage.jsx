import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi, describeApiError } from '../lib/pickleballApi'
import { canCheckIn, canSetAvailability, canLeaveSession, canCancelRegistration } from '../../lib/pickleball/attendance'
import PlayerStatusChip from '../components/PlayerStatusChip'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'
import { Search, UserCheck, LogOut, ListOrdered, Link2, Unlock } from '../../components/icons/icons'

export default function CheckInPage() {
  const { sessionId, session } = useOutletContext()
  const [sessionPlayers, setSessionPlayers] = useState([])
  const [counts, setCounts] = useState(null)
  const [orgPlayers, setOrgPlayers] = useState([])
  // Registering someone is a "find one person" task, so the picker queries
  // the roster rather than holding all of it. Without this the control could
  // only ever offer whatever page happened to be loaded, which silently hid
  // players from any organisation past one page.
  const [orgPlayerQuery, setOrgPlayerQuery] = useState('')
  const [queuedSessionPlayerIds, setQueuedSessionPlayerIds] = useState(new Set())
  const [pairs, setPairs] = useState([])
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState(null)
  const [selectedNewPlayerId, setSelectedNewPlayerId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [pairingSelection, setPairingSelection] = useState([])

  // A FIXED_PAIRS session is the only session type with any session_pairs
  // rows at all (spec Part B) -- `session` starts null (SessionLayout's own
  // fetch hasn't resolved yet), so this is false on first render and flips
  // true once it loads, which is exactly what gates the extra /pairs fetch
  // in reload() below. An OPEN_PLAY session never flips it, so that fetch
  // (and everything this flag renders) never happens there -- this page is
  // provably unchanged for OPEN_PLAY.
  const isFixedPairs = session?.sessionType === 'FIXED_PAIRS'

  async function reload() {
    // Queue membership isn't part of this page's own session-players fetch
    // (attendanceStatus/availabilityStatus only), and this page doesn't
    // consume the realtime snapshot (see Task 4/5's data-flow lesson --
    // CheckInPage already has its own reload()-after-mutation pattern), so
    // this fetches the queue's own list directly, the same one QueuePage
    // reads, to know which checked-in/available players already have an
    // open entry (QUEUED/ASSIGNED/PLAYING -- queue_entries' only possible
    // statuses per its own CHECK constraint) and shouldn't show "Join queue"
    // again.
    // The pairs fetch only runs for a FIXED_PAIRS session -- an OPEN_PLAY
    // session has no session_pairs rows and isFixedPairs never turns on
    // for it, so this call (and the pairing UI it feeds) never happens
    // there. See isFixedPairs' own comment.
    const [sessionData, orgData, queueData, pairsData] = await Promise.all([
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/players`),
      // Only the first page: this picker is search-backed (see
      // orgPlayerQuery below), so it never needs the whole roster in memory.
      // Asking for all of it was what made this page scale badly.
      pickleballApi.get('/api/pickleball/players'),
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/queue`),
      isFixedPairs ? pickleballApi.get(`/api/pickleball/sessions/${sessionId}/pairs`) : Promise.resolve({ pairs: [] }),
    ])
    setSessionPlayers(sessionData.players)
    setCounts(sessionData.counts)
    setOrgPlayers(orgData.players)
    setQueuedSessionPlayerIds(new Set(queueData.queue.map((entry) => entry.sessionPlayerId)))
    setPairs(pairsData.pairs)
    setStatus('ready')
  }

  useEffect(() => {
    // Gated on `session` having resolved (not just sessionId): on first
    // mount, SessionLayout's own session fetch is still in flight, so
    // `session` is null and `isFixedPairs` is unavoidably false. Running
    // reload() at that point would only need to run AGAIN once `session`
    // resolves and `isFixedPairs` flips to true, to pick up the /pairs fetch
    // it gates above -- two overlapping reload() calls racing on the same
    // setStates for every FIXED_PAIRS session's initial mount. Waiting for
    // `session` here means reload() runs exactly once, already knowing the
    // real isFixedPairs value.
    if (session === null) return undefined
    let ignore = false
    reload().catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session])

  const registeredPlayerIds = new Set(
    sessionPlayers.filter((p) => p.registrationStatus === 'REGISTERED').map((p) => p.playerId)
  )
  // Server-side lookup for the register-a-player picker, debounced. Kept
  // separate from `load()` so typing a name never re-fetches the session,
  // queue and pairs alongside it.
  useEffect(() => {
    let ignore = false
    const handle = setTimeout(() => {
      const query = orgPlayerQuery.trim()
      pickleballApi
        .get(`/api/pickleball/players${query ? `?search=${encodeURIComponent(query)}` : ''}`)
        .then((data) => { if (!ignore) setOrgPlayers(data.players) })
        .catch(() => { /* the picker just stays as it was */ })
    }, orgPlayerQuery ? 250 : 0)
    return () => { ignore = true; clearTimeout(handle) }
  }, [orgPlayerQuery])

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

  // Mirrors joinQueue's own hasOpenQueueEntry guard (queue_entries' status
  // CHECK constraint only allows QUEUED/ASSIGNED/PLAYING, so any row at all
  // for this sessionPlayerId means "already has an open entry") -- checked
  // in, available, and not already queued.
  //
  // C1 fix: a tournament pair (session.tournamentFormat set -- a tournament
  // is ALSO a FIXED_PAIRS session, so `isFixedPairs` alone does not exclude
  // it) has no business in the fairness queue at all -- its next seating is
  // decided entirely by the fixture list. Without this, the button rendered
  // for a tournament pair's members, and tapping it reached the server-side
  // refusal added to joinQueue -- correct, but a button that always 409s is
  // still the wrong thing to show.
  function canJoinQueue(player) {
    return (
      !session?.tournamentFormat &&
      player.attendanceStatus === 'CHECKED_IN' &&
      player.availabilityStatus === 'AVAILABLE' &&
      !queuedSessionPlayerIds.has(player.id)
    )
  }
  const joinQueueEligibleSessionPlayerIds = filteredPlayers.filter(canJoinQueue).map((player) => player.id)

  // Derived per-player pairing lookups (FIXED_PAIRS sessions only): which
  // pair (if any) a session_player currently belongs to, and their
  // partner's display name for that pair -- built fresh from `pairs` on
  // every render rather than stored as its own piece of state, since `pairs`
  // (refreshed by reload()) is already the single source of truth.
  const pairIdBySessionPlayerId = new Map()
  const partnerDisplayNameBySessionPlayerId = new Map()
  for (const pair of pairs) {
    pairIdBySessionPlayerId.set(pair.sessionPlayerAId, pair.id)
    pairIdBySessionPlayerId.set(pair.sessionPlayerBId, pair.id)
    partnerDisplayNameBySessionPlayerId.set(pair.sessionPlayerAId, pair.playerBDisplayName)
    partnerDisplayNameBySessionPlayerId.set(pair.sessionPlayerBId, pair.playerADisplayName)
  }

  // Mirrors formPair's own checked-in requirement (spec Part B) -- the
  // player-not-checked-in-yet 409 the server would otherwise return.
  function canSelectForPairing(player) {
    return isFixedPairs && player.attendanceStatus === 'CHECKED_IN' && !pairIdBySessionPlayerId.has(player.id)
  }

  function togglePairingSelection(sessionPlayerId) {
    setPairingSelection((current) => {
      if (current.includes(sessionPlayerId)) return current.filter((id) => id !== sessionPlayerId)
      if (current.length >= 2) return current
      return [...current, sessionPlayerId]
    })
  }

  function handleFormPair() {
    if (pairingSelection.length !== 2) return
    const [sessionPlayerAId, sessionPlayerBId] = pairingSelection
    runAction(
      pickleballApi.post(`/api/pickleball/sessions/${sessionId}/pairs`, { sessionPlayerAId, sessionPlayerBId }),
      () => setPairingSelection([]),
    )
  }

  function handleUnpair(pairId) {
    runAction(pickleballApi.delete(`/api/pickleball/sessions/${sessionId}/pairs/${pairId}`))
  }

  async function runAction(actionPromise, onSuccess) {
    setMessage(null)
    try {
      const result = await actionPromise
      await reload()
      if (onSuccess) onSuccess(result)
    } catch (error) {
      setMessage({ type: 'error', text: describeApiError(error) })
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

  // No bulk join-queue endpoint exists (only the single-player one this page
  // otherwise uses per row), so this composes N independent calls the same
  // way handleUncheckAll already does: Promise.allSettled (one failure can't
  // hide the others' success), an unconditional reload so the screen always
  // reflects real server state, and real success/failure counts rather than
  // a single generic message.
  async function handleJoinAll() {
    if (!joinQueueEligibleSessionPlayerIds.length) return
    setMessage(null)
    const results = await Promise.allSettled(
      joinQueueEligibleSessionPlayerIds.map((sessionPlayerId) =>
        pickleballApi.post(`/api/pickleball/sessions/${sessionId}/queue`, { sessionPlayerId })
      )
    )
    const succeededCount = results.filter((result) => result.status === 'fulfilled').length
    const failedCount = results.length - succeededCount

    try {
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: `Added ${succeededCount} of ${results.length} players to the queue, but could not refresh the roster: ${error.message}` })
      return
    }

    if (failedCount === 0) {
      setMessage({ type: 'success', text: `Added ${pluralize(succeededCount, 'player')} to the queue.` })
    } else if (succeededCount === 0) {
      setMessage({ type: 'error', text: `Failed to add ${pluralize(failedCount, 'player')} to the queue.` })
    } else {
      setMessage({
        type: 'error',
        text: `Added ${succeededCount} of ${results.length} players to the queue; ${pluralize(failedCount, 'player')} failed.`,
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

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <input
          type="search"
          value={orgPlayerQuery}
          data-testid="register-player-search"
          onChange={(event) => setOrgPlayerQuery(event.target.value)}
          placeholder="Search the roster"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-48"
        />
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
          className="pb-btn-primary inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-4 text-sm"
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
            className="pb-btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed"
          >
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Check all
          </button>
          <button
            type="button"
            onClick={handleUncheckAll}
            disabled={!leaveEligiblePlayerIds.length}
            data-testid="checkin-uncheck-all"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Uncheck all
          </button>
          <button
            type="button"
            onClick={handleJoinAll}
            disabled={!joinQueueEligibleSessionPlayerIds.length}
            data-testid="checkin-join-queue-all"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
            Join all to queue
          </button>
          {isFixedPairs ? (
            <button
              type="button"
              onClick={handleFormPair}
              disabled={pairingSelection.length !== 2}
              data-testid="checkin-form-pair"
              className="pb-btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              Form pair {pairingSelection.length ? `(${pairingSelection.length}/2)` : ''}
            </button>
          ) : null}
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
            {isFixedPairs && player.attendanceStatus === 'CHECKED_IN' ? (
              partnerDisplayNameBySessionPlayerId.has(player.id) ? (
                <span className="text-xs font-medium text-slate-500" data-testid={`checkin-partner-${player.id}`}>
                  Paired with {partnerDisplayNameBySessionPlayerId.get(player.id)}
                </span>
              ) : canSelectForPairing(player) ? (
                <>
                  <span data-testid={`checkin-needs-partner-${player.id}`}>
                    <PlayerStatusChip status="NEEDS_PARTNER" />
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <input
                      type="checkbox"
                      checked={pairingSelection.includes(player.id)}
                      onChange={() => togglePairingSelection(player.id)}
                      disabled={pairingSelection.length >= 2 && !pairingSelection.includes(player.id)}
                      data-testid={`checkin-pair-select-${player.id}`}
                    />
                    Select for pairing
                  </label>
                </>
              ) : null
            ) : null}
            <div className="ml-auto flex gap-2">
              {canCheckIn(player) ? (
                <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { playerId: player.playerId }))} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50">
                  Check in
                </button>
              ) : null}
              {canCancelRegistration(player) ? (
                <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/cancel`, { playerId: player.playerId }))} className="inline-flex min-h-11 items-center justify-center rounded border border-rose-300 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                  Cancel
                </button>
              ) : null}
              {canSetAvailability(player) ? (
                player.availabilityStatus !== 'AVAILABLE' ? (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/availability`, { playerId: player.playerId, status: 'AVAILABLE' }))} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50">
                    Set available
                  </button>
                ) : (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/availability`, { playerId: player.playerId, status: 'TEMPORARILY_UNAVAILABLE' }))} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50">
                    Set unavailable
                  </button>
                )
              ) : null}
              {canLeaveSession(player) ? (
                <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/leave`, { playerId: player.playerId }))} className="inline-flex min-h-11 items-center justify-center rounded border border-rose-300 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                  Leave
                </button>
              ) : null}
              {canJoinQueue(player) ? (
                <button
                  type="button"
                  onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/queue`, { sessionPlayerId: player.id }))}
                  className="pb-btn-primary inline-flex min-h-11 items-center gap-1.5 justify-center rounded px-3 text-xs font-semibold"
                >
                  <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
                  Join queue
                </button>
              ) : null}
              {isFixedPairs && player.attendanceStatus === 'CHECKED_IN' && pairIdBySessionPlayerId.has(player.id) ? (
                <button
                  type="button"
                  onClick={() => handleUnpair(pairIdBySessionPlayerId.get(player.id))}
                  data-testid={`checkin-unpair-${player.id}`}
                  className="inline-flex min-h-11 items-center gap-1.5 justify-center rounded border border-rose-300 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                  Unpair
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
