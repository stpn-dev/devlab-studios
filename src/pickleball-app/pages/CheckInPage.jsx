import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

const AVAILABILITY_LABELS = { AVAILABLE: 'Available', TEMPORARILY_UNAVAILABLE: 'Unavailable', RESTING: 'Resting' }

export default function CheckInPage() {
  const { sessionId } = useOutletContext()
  const [sessionPlayers, setSessionPlayers] = useState([])
  const [counts, setCounts] = useState(null)
  const [orgPlayers, setOrgPlayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState(null)
  const [selectedNewPlayerId, setSelectedNewPlayerId] = useState('')

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

  const registeredPlayerIds = new Set(sessionPlayers.map((p) => p.playerId))
  const registerableOrgPlayers = orgPlayers.filter((p) => p.active && !registeredPlayerIds.has(p.id))

  async function runAction(actionPromise) {
    setMessage(null)
    try {
      await actionPromise
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Check-in</h1>
        {counts ? (
          <p className="text-sm text-slate-500" data-testid="attendance-counts">
            {counts.checkedIn} checked in / {counts.registered} registered
          </p>
        ) : null}
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load check-in data.</p> : null}
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

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
          onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players`, { playerId: selectedNewPlayerId })).then(() => setSelectedNewPlayerId(''))}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          Register
        </button>
      </div>

      <div className="space-y-2" data-testid="checkin-list">
        {sessionPlayers.map((player) => (
          <div key={player.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="min-w-[10rem] font-semibold text-slate-900">{player.displayName}</span>
            <span className="text-slate-500">{player.attendanceStatus}</span>
            {player.attendanceStatus === 'CHECKED_IN' ? (
              <span className="text-slate-500">{AVAILABILITY_LABELS[player.availabilityStatus] || player.availabilityStatus}</span>
            ) : null}
            <div className="ml-auto flex gap-2">
              {player.attendanceStatus === 'NOT_CHECKED_IN' ? (
                <>
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/check-in`, { playerId: player.playerId }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                    Check in
                  </button>
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/cancel`, { playerId: player.playerId }))} className="rounded border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                    Cancel
                  </button>
                </>
              ) : null}
              {player.attendanceStatus === 'CHECKED_IN' ? (
                <>
                  {player.availabilityStatus !== 'AVAILABLE' ? (
                    <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/availability`, { playerId: player.playerId, status: 'AVAILABLE' }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                      Set available
                    </button>
                  ) : (
                    <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/availability`, { playerId: player.playerId, status: 'TEMPORARILY_UNAVAILABLE' }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                      Set unavailable
                    </button>
                  )}
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/players/leave`, { playerId: player.playerId }))} className="rounded border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                    Leave
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
        {!sessionPlayers.length && status === 'ready' ? <p className="text-sm text-slate-500">No players registered yet.</p> : null}
      </div>
    </div>
  )
}
