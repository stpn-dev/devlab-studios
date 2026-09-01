import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import GameScoreboard from '../components/GameScoreboard'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonLine, SkeletonRows } from '../components/SkeletonLoader'

function StartGameForm({ sessionId, court, onStarted }) {
  const [teams, setTeams] = useState(null)
  const [servingTeam, setServingTeam] = useState('A')
  const [teamAServerId, setTeamAServerId] = useState('')
  const [teamBServerId, setTeamBServerId] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}/courts/${court.id}/teams`)
      .then((data) => {
        if (!ignore) setTeams(data.teams)
      })
      .catch(() => {
        if (!ignore) setMessage({ type: 'error', text: "Could not load this court's teams." })
      })
    return () => {
      ignore = true
    }
  }, [sessionId, court.id])

  if (teams === null) {
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {message ? (
          <p className="text-sm text-rose-600">{message.text}</p>
        ) : (
          <SkeletonBlock label="Loading teams…">
            <SkeletonLine className="h-4 w-1/3" />
            <div className="mt-3">
              <SkeletonRows rows={2} />
            </div>
          </SkeletonBlock>
        )}
      </div>
    )
  }

  const [teamA, teamB] = teams

  async function handleStart() {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/games/start`, {
        sessionCourtId: court.id,
        servingTeam,
        teamAStartingServerSessionPlayerId: teamAServerId,
        teamBStartingServerSessionPlayerId: teamBServerId,
      })
      onStarted()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`start-game-form-${court.id}`}>
      <p className="font-semibold text-slate-900">Start a game on {court.courtName}</p>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Serving team</span>
        <select value={servingTeam} onChange={(event) => setServingTeam(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="A">Team A</option>
          <option value="B">Team B</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Team A starting server</span>
        <select value={teamAServerId} onChange={(event) => setTeamAServerId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" data-testid="team-a-server-select">
          <option value="">Select…</option>
          {(teamA?.members || []).map((m) => (
            <option key={m.sessionPlayerId} value={m.sessionPlayerId}>{m.displayName}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Team B starting server</span>
        <select value={teamBServerId} onChange={(event) => setTeamBServerId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" data-testid="team-b-server-select">
          <option value="">Select…</option>
          {(teamB?.members || []).map((m) => (
            <option key={m.sessionPlayerId} value={m.sessionPlayerId}>{m.displayName}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!teamAServerId || !teamBServerId}
        onClick={handleStart}
        className="pb-btn-primary rounded-lg px-4 py-2 text-sm"
      >
        Start game
      </button>
    </div>
  )
}

export default function GamesListPage() {
  const { sessionId, snapshot } = useOutletContext()
  const [startingCourtId, setStartingCourtId] = useState(null)

  const loading = !snapshot
  const assignedCourtsWithoutGame = loading ? [] : snapshot.courts.filter((c) => c.status === 'ASSIGNED')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Games</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>

      {loading ? (
        <SkeletonBlock>
          <SkeletonRows rows={3} />
        </SkeletonBlock>
      ) : (
        <>
          {assignedCourtsWithoutGame.length ? (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Ready to start</h2>
              <div className="space-y-2">
                {assignedCourtsWithoutGame.map((court) =>
                  startingCourtId === court.id ? (
                    <StartGameForm key={court.id} sessionId={sessionId} court={court} onStarted={() => setStartingCourtId(null)} />
                  ) : (
                    <button
                      key={court.id}
                      type="button"
                      onClick={() => setStartingCourtId(court.id)}
                      className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm shadow-sm hover:border-brand/40"
                    >
                      {court.courtName} — assigned, no game started
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}

          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Games</h2>
            <div className="space-y-3" data-testid="games-list">
              {snapshot.games.map((game) => (
                <Link
                  key={game.id}
                  to={game.id}
                  className="block space-y-1.5 rounded-xl transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-end gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {game.status === 'IN_PROGRESS' ? <span className="pb-live-dot" /> : null}
                    {game.status}
                  </div>
                  <GameScoreboard game={game} variant="compact" />
                </Link>
              ))}
              {!snapshot.games.length ? <EmptyState title="No games yet." description="Start a game from a court that's assigned above, or from the Courts tab." /> : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
