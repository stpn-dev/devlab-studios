import { usePublicSessionView } from './lib/usePublicSessionView'

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
      <h1 className="text-5xl font-bold text-white">{view.session.name}</h1>
      <div className="grid gap-8 sm:grid-cols-2" data-testid="tv-courts">
        {view.courts.map((court) => {
          const game = view.games.find((g) => g.id === court.currentGameId)
          return (
            <div key={court.id} className="rounded-2xl border border-white/10 bg-white/5 p-8">
              <p className="text-2xl font-semibold text-white">{court.courtName}</p>
              <p className="mt-1 text-lg text-slate-400">{court.status}</p>
              {game ? (
                <p className="mt-6 text-8xl font-black text-white">{game.scoreA} – {game.scoreB}</p>
              ) : (
                <p className="mt-6 text-2xl text-slate-500">No game in progress.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
