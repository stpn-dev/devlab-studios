import { usePublicSessionView } from './lib/usePublicSessionView'

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
      <h1 className="text-2xl font-semibold text-white">{view.session.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="live-courts">
        {view.courts.map((court) => {
          const game = view.games.find((g) => g.id === court.currentGameId)
          return (
            <div key={court.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">{court.courtName}</p>
              <p className="text-xs text-slate-400">{court.status}</p>
              {game ? (
                <p className="mt-2 text-3xl font-bold text-white">{game.scoreA} – {game.scoreB}</p>
              ) : (
                <p className="mt-2 text-sm text-slate-400">No game in progress.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
