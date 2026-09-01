import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function LeaderboardPage() {
  const { sessionId } = useOutletContext()
  const [rows, setRows] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = `${sessionId}:${showAll}`
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setRows(null)
    setMessage(null)
  }

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
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Leaderboard</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Show provisional players
        </label>
      </div>
      <p className="text-xs text-slate-400">
        <a href="/pickleball/methodology" className="underline hover:text-slate-600">
          How OPI and confidence tiers work
        </a>
      </p>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      {rows === null && !message ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {rows && !rows.length ? <p className="text-sm text-slate-500">No qualifying players yet.</p> : null}
      {rows && rows.length ? (
        <div className="space-y-2" data-testid="leaderboard-list">
          {rows.map((row, index) => (
            <div
              key={row.playerId}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm shadow-sm ${
                index < 3 ? 'border-brand/30 bg-brand/5' : 'border-slate-200 bg-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-6 text-right ${index < 3 ? 'pb-score text-brand' : 'font-semibold text-slate-400'}`}>{index + 1}</span>
                <span className="font-semibold text-slate-900">{row.displayName}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{row.confidenceTier}</span>
              </span>
              <span className="flex items-center gap-3 text-slate-600">
                <span>{row.eligibleGamesCount} games</span>
                <span className="pb-score text-lg text-slate-900">{row.opi.toFixed(2)}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
