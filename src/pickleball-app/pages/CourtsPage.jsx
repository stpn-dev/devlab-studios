import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import CourtCard from '../components/CourtCard'

// Derives CourtCard's display state from the court's raw `status` field and
// its separately-tracked `enabled` flag (disabling a court doesn't change
// `status`) -- a pure presentation mapping, read-only against fields the
// page already fetches. `enabled === false` always wins (a disabled court is
// "out of service" regardless of whether it's sitting AVAILABLE or still
// ASSIGNED to a game); the raw `OUT_OF_SERVICE` status value maps the same
// way even if a future flow ever sets `enabled` back to true on it. Anything
// other than AVAILABLE (ASSIGNED, WARMUP, PLAYING, FINISHING) reads as "in
// play" for card purposes -- the exact raw status word is still shown
// verbatim elsewhere in the card.
function deriveCourtCardStatus(court, enabled) {
  if (enabled === false || court.status === 'OUT_OF_SERVICE') return 'OUT_OF_SERVICE'
  if (court.status === 'AVAILABLE') return 'AVAILABLE'
  return 'LIVE'
}

// Fairness-ranked preview for RecommendedMatchCard: reproduces rules 1+2 of
// `selectNextPlayers()`'s ordering (src/lib/pickleball/queueEngine.ts) --
// fewest games played, then longest wait -- the queue snapshot's own array
// order is by `queuedAt` only (listQueueForSession's ORDER BY), not this
// fairness order, so it's re-sorted here rather than trusted as-is.
//
// This does NOT reproduce rule 3 (repeat-avoidance, queueEngine.ts:51-86):
// that tiebreak needs each candidate's `lastPairedWith`, which is
// server-only state this client has no access to, so it can never trigger
// here. In the rare case where rule 3 would fire server-side (>=5 eligible
// candidates with a same-`gamesPlayed` recent-repeat tie), the server's
// actual pick can differ from the last name shown in this preview -- the
// real `SessionCoordinatorDO.assignCourt` call this card's "Assign" button
// triggers still authoritatively decides exactly who gets seated, this is
// only a preview.
//
// Restricted to entries the fairness engine actually flagged eligible
// (non-empty `reasons`, attached by `GET /queue`) and capped at 4 -- a full
// doubles match -- since the client doesn't know this session's ruleset
// format (SINGLES needs 2, DOUBLES needs 4); see RecommendedMatchCard.jsx's
// copy for how that ambiguity is framed to the operator.
function recommendedCandidates(queue) {
  return queue
    .filter((entry) => entry.status === 'QUEUED' && entry.reasons?.length)
    .sort((a, b) => {
      if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed
      return Date.parse(a.queuedAt) - Date.parse(b.queuedAt)
    })
    .slice(0, 4)
}

export default function CourtsPage() {
  const { sessionId, snapshot } = useOutletContext()
  const navigate = useNavigate()
  const [enabledByCourtId, setEnabledByCourtId] = useState({})
  const [message, setMessage] = useState(null)

  async function loadEnabledFlags() {
    const { courts } = await pickleballApi.get(`/api/pickleball/sessions/${sessionId}/courts`)
    setEnabledByCourtId(Object.fromEntries(courts.map((c) => [c.id, c.enabled])))
  }

  useEffect(() => {
    loadEnabledFlags().catch(() => setMessage({ type: 'error', text: 'Could not load court status.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    setEnabledByCourtId({})
  }, [snapshot])

  async function runAction(actionPromise, { refreshEnabled } = {}) {
    setMessage(null)
    try {
      await actionPromise
      if (refreshEnabled) await loadEnabledFlags()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  if (!snapshot) return <p className="text-sm text-slate-500">Loading…</p>

  const recommended = recommendedCandidates(snapshot.queue)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Courts</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="courts-grid">
        {snapshot.courts.map((court) => {
          const enabled = court.id in enabledByCourtId ? enabledByCourtId[court.id] : court.enabled
          const liveGame = snapshot.games.find((g) => g.sessionCourtId === court.id && g.status === 'IN_PROGRESS')
          return (
            <CourtCard
              key={court.id}
              court={court}
              status={deriveCourtCardStatus(court, enabled)}
              enabled={enabled}
              game={liveGame}
              recommended={recommended}
              onAssign={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { sessionCourtId: court.id }))}
              onRelease={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/release`, { sessionCourtId: court.id }))}
              onEnable={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/enable`, { sessionCourtId: court.id }), { refreshEnabled: true })}
              onDisable={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/disable`, { sessionCourtId: court.id }), { refreshEnabled: true })}
              onOpen={liveGame ? () => navigate(`/pickleball/app/sessions/${sessionId}/games/${liveGame.id}`) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
