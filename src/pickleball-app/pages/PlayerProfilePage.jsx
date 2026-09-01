import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function PlayerProfilePage() {
  const { playerId } = useParams()
  const [player, setPlayer] = useState(null)
  const [stats, setStats] = useState(null)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = playerId
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setPlayer(null)
    setStats(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    Promise.all([
      pickleballApi.get(`/api/pickleball/players/${playerId}`),
      pickleballApi.get(`/api/pickleball/players/${playerId}/stats`),
    ])
      .then(([playerData, statsData]) => {
        if (!ignore) {
          setPlayer(playerData.player)
          setStats(statsData)
        }
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [playerId])

  if (message) return <p className="text-sm text-rose-600">{message.text}</p>
  if (!stats || !player) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{player.displayName}</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        <a href="/pickleball/methodology" className="mt-2 inline-block text-xs text-slate-400 underline hover:text-slate-600">
          How OPI and confidence tiers work
        </a>
      </div>
      <div className="pb-scoreboard p-6" data-testid="player-all-time">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">All-time OPI</p>
        {stats.allTime ? (
          <>
            <p className="pb-score text-4xl text-white">{stats.allTime.opi.toFixed(2)}</p>
            <p className="mt-1 text-sm text-slate-300">
              {stats.allTime.eligibleGamesCount} eligible games · {stats.allTime.confidenceTier}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-300">No eligible games yet.</p>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">By session</h2>
        <div className="space-y-2" data-testid="player-sessions">
          {stats.sessions.map((row) => (
            <div key={row.sessionId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <span className="font-semibold text-slate-900">{row.sessionName}</span>
              <span className="text-slate-600"><span className="pb-score">{row.opi.toFixed(2)}</span> · {row.eligibleGamesCount} games · {row.confidenceTier}</span>
            </div>
          ))}
          {!stats.sessions.length ? <p className="text-sm text-slate-500">No sessions yet.</p> : null}
        </div>
      </div>
    </div>
  )
}
