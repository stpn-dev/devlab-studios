import { useOutletContext, useParams } from 'react-router-dom'

export default function ScorekeeperPage() {
  const { gameId } = useParams()
  const { snapshot } = useOutletContext()

  if (!snapshot) return <p className="text-sm text-slate-500">Loading…</p>

  const game = snapshot.games.find((g) => g.id === gameId)
  if (!game) return <p className="text-sm text-rose-600">Game not found.</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Scorekeeper</h1>
      <p data-testid="scorekeeper-score" className="text-4xl font-bold text-slate-900">{game.scoreA} – {game.scoreB}</p>
    </div>
  )
}
