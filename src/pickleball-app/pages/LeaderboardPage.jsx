import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function LeaderboardPage() {
  const { sessionId } = useOutletContext()
  const [rows, setRows] = useState([])
  const [showAll, setShowAll] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let ignore = false
    const query = showAll ? '?minGames=0' : ''
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}/leaderboard${query}`)
      .then((data) => {
        if (!ignore) setRows(data.leaderboard)
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [sessionId, showAll])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Leaderboard</h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Show provisional players
        </label>
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      {!rows.length ? <p className="text-sm text-slate-500">No qualifying players yet.</p> : null}
      {rows.length ? (
        <div className="space-y-2" data-testid="leaderboard-list">
          {rows.map((row, index) => (
            <div key={row.playerId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className="w-6 text-right font-semibold text-slate-400">{index + 1}</span>
                <span className="font-semibold text-slate-900">{row.displayName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{row.confidenceTier}</span>
              </span>
              <span className="flex items-center gap-3 text-slate-600">
                <span>{row.eligibleGamesCount} games</span>
                <span className="text-lg font-bold text-slate-900">{row.opi.toFixed(2)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
