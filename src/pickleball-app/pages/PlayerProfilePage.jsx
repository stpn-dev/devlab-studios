import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function PlayerProfilePage() {
  const { playerId } = useParams()
  const [stats, setStats] = useState(null)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = `${playerId}`
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setStats(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/players/${playerId}/stats`)
      .then((data) => {
        if (!ignore) setStats(data)
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [playerId])

  if (message) return <p className="text-sm text-rose-600">{message.text}</p>
  if (!stats) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Player Profile</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6" data-testid="player-all-time">
        <p className="text-xs font-medium uppercase text-slate-500">All-time OPI</p>
        {stats.allTime ? (
          <>
            <p className="text-4xl font-bold text-slate-900">{stats.allTime.opi.toFixed(2)}</p>
            <p className="mt-1 text-sm text-slate-500">
              {stats.allTime.eligibleGamesCount} eligible games · {stats.allTime.confidenceTier}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">No eligible games yet.</p>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">By session</h2>
        <div className="space-y-2" data-testid="player-sessions">
          {stats.sessions.map((row) => (
            <div key={row.sessionId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="font-semibold text-slate-900">{row.sessionName}</span>
              <span className="text-slate-600">{row.opi.toFixed(2)} · {row.eligibleGamesCount} games · {row.confidenceTier}</span>
            </div>
          ))}
          {!stats.sessions.length ? <p className="text-sm text-slate-500">No sessions yet.</p> : null}
        </div>
      </div>
    </div>
  )
}
