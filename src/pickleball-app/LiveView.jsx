import { usePublicSessionView } from './lib/usePublicSessionView'

function servingLabel(game) {
  if (!game) return null
  const teamName = game.servingTeam === 'A' ? game.teamAName : game.teamBName
  const label = teamName || `Team ${game.servingTeam}`
  return game.format === 'SINGLES' ? `Serving: ${label}` : `Serving: ${label} (Server ${game.serverNumber})`
}

export default function LiveView({ code }) {
  const { view, loadError } = usePublicSessionView(code)

  if (loadError) {
    return <p className="p-6 text-sm text-rose-300">This live view is not available.</p>
  }

  if (!view) {
    return <p className="p-6 text-sm text-slate-300">Loading…</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{view.session.name}</h1>
        <div className="pb-rule mt-2 h-[3px] w-11 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="live-courts">
        {view.courts.map((court) => {
          const game = view.games.find((g) => g.id === court.currentGameId)
          return (
            <div key={court.id} className="pb-scoreboard p-4">
              <p className="text-sm font-semibold text-white">{court.courtName}</p>
              <p className="text-xs text-slate-400">{court.status}</p>
              {game ? (
                <>
                  <p className="mt-2 text-sm text-slate-300">{game.teamAName || 'Team A'} vs {game.teamBName || 'Team B'}</p>
                  <p className="pb-score mt-1 text-3xl text-white">{game.scoreA} – {game.scoreB}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-300">
                    <span className="pb-live-dot" /> {servingLabel(game)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-400">No game in progress.</p>
              )}
            </div>
          )
        })}
      </div>

      {view.leaderboard && view.leaderboard.length > 0 && (
        <div className="pb-scoreboard p-4" data-testid="live-leaderboard">
          <p className="text-sm font-semibold text-white">Leaderboard</p>
          <ol className="mt-2 space-y-1 text-sm text-slate-300">
            {view.leaderboard.map((row) => (
              <li key={row.rank} className="flex items-center justify-between gap-2">
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
