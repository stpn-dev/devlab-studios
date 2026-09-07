import { useOutletContext } from 'react-router-dom'
import { useState } from 'react'
import { pickleballApi } from '../lib/pickleballApi'
import QueuePlayerRow from '../components/QueuePlayerRow'
import PairRow from '../components/PairRow'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'
import EmptyQueueGraphic from '../components/illustrations/EmptyQueueGraphic'

// Minutes elapsed since `queuedAt`, for the row's compact "N games ·
// waiting Nm" summary -- mirrors the same wait-time computation
// `selectNextPlayers()` uses for its own `reasons` text
// (src/lib/pickleball/queueEngine.ts), just recomputed against the
// browser's clock so it stays live between snapshot refreshes instead of
// only updating whenever a new snapshot happens to arrive.
function waitMinutesSince(queuedAt) {
  if (!queuedAt) return 0
  return Math.max(0, Math.round((Date.now() - Date.parse(queuedAt)) / 60000))
}

// Groups queue entries sharing one session_pair_id (FIXED_PAIRS --
// joinQueueAsPair inserts two rows, one per member, sharing one
// session_pair_id and queued_at; see queueEntries.js's own header comment)
// into a single group, so the waiting list can render one PairRow instead of
// two separate QueuePlayerRows. An OPEN_PLAY entry's sessionPairId is always
// null (plain joinQueue never sets it), so it always becomes its own
// singleton group -- the grouping is entirely data-driven off what's already
// in the snapshot, with no session-type branch anywhere, so an OPEN_PLAY
// session's queue renders exactly as it did before this function existed.
function groupQueueEntries(entries) {
  const groups = []
  const groupIndexByPairId = new Map()
  for (const entry of entries) {
    if (!entry.sessionPairId) {
      groups.push([entry])
      continue
    }
    const existingIndex = groupIndexByPairId.get(entry.sessionPairId)
    if (existingIndex === undefined) {
      groupIndexByPairId.set(entry.sessionPairId, groups.length)
      groups.push([entry])
    } else {
      groups[existingIndex].push(entry)
    }
  }
  return groups
}

export default function QueuePage() {
  const { sessionId, snapshot } = useOutletContext()
  const [message, setMessage] = useState(null)

  async function handleLeave(sessionPlayerId) {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/queue/leave`, { sessionPlayerId })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const loading = !snapshot
  const queued = loading ? [] : snapshot.queue.filter((entry) => entry.status === 'QUEUED')
  const assigned = loading ? [] : snapshot.queue.filter((entry) => entry.status !== 'QUEUED')
  const queuedGroups = groupQueueEntries(queued)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Queue</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

      {loading ? (
        <SkeletonBlock>
          <SkeletonRows rows={4} />
        </SkeletonBlock>
      ) : (
        <>
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Waiting ({queued.length})</h2>
            <div className="space-y-2" data-testid="queue-waiting-list">
              {queuedGroups.map((group, index) =>
                group.length === 2 ? (
                  <PairRow
                    key={group[0].id}
                    position={index + 1}
                    players={group.map((entry) => ({ displayName: entry.displayName, sessionPlayerId: entry.sessionPlayerId }))}
                    gamesPlayed={group[0].gamesPlayed}
                    waitMinutes={waitMinutesSince(group[0].queuedAt)}
                    reasons={group[0].reasons}
                    onLeave={() => handleLeave(group[0].sessionPlayerId)}
                  />
                ) : (
                  <QueuePlayerRow
                    key={group[0].id}
                    position={index + 1}
                    player={{ displayName: group[0].displayName, sessionPlayerId: group[0].sessionPlayerId }}
                    gamesPlayed={group[0].gamesPlayed}
                    waitMinutes={waitMinutesSince(group[0].queuedAt)}
                    reasons={group[0].reasons}
                    onLeave={() => handleLeave(group[0].sessionPlayerId)}
                  />
                )
              )}
              {!queuedGroups.length ? <EmptyState title="Nobody waiting." illustration={EmptyQueueGraphic} /> : null}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">On courts ({assigned.length})</h2>
            <div className="space-y-2" data-testid="queue-assigned-list">
              {assigned.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  <span className="pb-live-dot" />
                  {entry.displayName} — {entry.status}
                </div>
              ))}
              {!assigned.length ? <EmptyState title="Nobody currently assigned." compact /> : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
