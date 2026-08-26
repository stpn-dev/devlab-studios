import { useOutletContext } from 'react-router-dom'
import { useState } from 'react'
import { pickleballApi } from '../lib/pickleballApi'

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

  if (!snapshot) return <p className="text-sm text-slate-500">Loading…</p>

  const queued = snapshot.queue.filter((entry) => entry.status === 'QUEUED')
  const assigned = snapshot.queue.filter((entry) => entry.status !== 'QUEUED')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Queue</h1>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Waiting ({queued.length})</h2>
        <div className="space-y-2" data-testid="queue-waiting-list">
          {queued.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <span>{entry.displayName} <span className="text-slate-400">({entry.gamesPlayed} played)</span></span>
              <button type="button" onClick={() => handleLeave(entry.sessionPlayerId)} className="rounded border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                Leave queue
              </button>
            </div>
          ))}
          {!queued.length ? <p className="text-sm text-slate-500">Nobody waiting.</p> : null}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">On courts ({assigned.length})</h2>
        <div className="space-y-2" data-testid="queue-assigned-list">
          {assigned.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              {entry.displayName} — {entry.status}
            </div>
          ))}
          {!assigned.length ? <p className="text-sm text-slate-500">Nobody currently assigned.</p> : null}
        </div>
      </div>
    </div>
  )
}
