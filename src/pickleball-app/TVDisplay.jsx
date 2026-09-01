import './pickleball.css'
import { usePublicSessionView } from './lib/usePublicSessionView'

function servingLabel(game) {
  if (!game) return null
  const teamName = game.servingTeam === 'A' ? game.teamAName : game.teamBName
  const label = teamName || `Team ${game.servingTeam}`
  return game.format === 'SINGLES' ? `Serving: ${label}` : `Serving: ${label} (Server ${game.serverNumber})`
}

export default function TVDisplay({ code }) {
  const { view, loadError } = usePublicSessionView(code)

  if (loadError) {
    return <p className="p-12 text-3xl text-rose-300">This display is not available.</p>
  }

  if (!view) {
    return <p className="p-12 text-3xl text-slate-300">Loading…</p>
  }

  return (
    <div className="min-h-screen space-y-10 p-10">
      <div>
        <h1 className="text-5xl font-extrabold tracking-tight text-white">{view.session.name}</h1>
        <div className="pb-rule mt-4 h-1.5 w-24 rounded-full" />
      </div>
      <div className="grid gap-8 sm:grid-cols-2" data-testid="tv-courts">
        {view.courts.map((court) => {
          const game = view.games.find((g) => g.id === court.currentGameId)
          return (
            <div key={court.id} className="pb-scoreboard p-8">
              <p className="text-2xl font-semibold text-white">{court.courtName}</p>
              <p className="mt-1 text-lg text-slate-400">{court.status}</p>
              {game ? (
                <>
                  <p className="mt-3 text-xl text-slate-300">{game.teamAName || 'Team A'} vs {game.teamBName || 'Team B'}</p>
                  <p className="pb-score mt-6 text-8xl text-white">{game.scoreA} – {game.scoreB}</p>
                  <p className="mt-3 flex items-center gap-2 text-lg text-emerald-300">
                    <span className="pb-live-dot" /> {servingLabel(game)}
                  </p>
                </>
              ) : (
                <p className="mt-6 text-2xl text-slate-500">No game in progress.</p>
              )}
            </div>
          )
        })}
      </div>

      {view.leaderboard && view.leaderboard.length > 0 && (
        <div className="pb-scoreboard p-8" data-testid="tv-leaderboard">
          <p className="text-2xl font-semibold text-white">Leaderboard</p>
          <ol className="mt-4 space-y-2 text-xl text-slate-300">
            {view.leaderboard.map((row) => (
              <li key={row.rank} className="flex items-center justify-between gap-4">
                <span>{row.rank}. {row.displayName}</span>
                <span className="text-slate-400">{row.opi.toFixed(2)} · {row.confidenceTier}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
