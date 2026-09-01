import { useOutletContext } from 'react-router-dom'
import { useState } from 'react'
import { pickleballApi } from '../lib/pickleballApi'
import QueuePlayerRow from '../components/QueuePlayerRow'
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
              {queued.map((entry, index) => (
                <QueuePlayerRow
                  key={entry.id}
                  position={index + 1}
                  player={{ displayName: entry.displayName, sessionPlayerId: entry.sessionPlayerId }}
                  gamesPlayed={entry.gamesPlayed}
                  waitMinutes={waitMinutesSince(entry.queuedAt)}
                  reasons={entry.reasons}
                  onLeave={() => handleLeave(entry.sessionPlayerId)}
                />
              ))}
              {!queued.length ? <EmptyState title="Nobody waiting." illustration={EmptyQueueGraphic} /> : null}
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
