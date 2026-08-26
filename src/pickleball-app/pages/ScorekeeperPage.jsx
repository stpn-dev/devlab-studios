import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import { officialScoreCall, contextualState, hasGameBeenWon } from '../../lib/pickleball/scoring/display'
import ContextualBanner from '../components/ContextualBanner'

export default function ScorekeeperPage() {
  const { gameId } = useParams()
  const { snapshot } = useOutletContext()
  const [rulesets, setRulesets] = useState(null)

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get('/api/pickleball/scoring-rulesets')
      .then((data) => {
        if (!ignore) setRulesets(data.rulesets)
      })
      .catch(() => {
        if (!ignore) setRulesets([])
      })
    return () => {
      ignore = true
    }
  }, [])

  if (!snapshot || rulesets === null) return <p className="text-sm text-slate-500">Loading…</p>

  const game = snapshot.games.find((g) => g.id === gameId)
  if (!game) return <p className="text-sm text-rose-600">Game not found.</p>

  const ruleset = rulesets.find((r) => r.id === game.scoringRulesetId)
  if (!ruleset) return <p className="text-sm text-rose-600">Unknown scoring ruleset for this game.</p>

  const state = { scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber }
  const gameWon = hasGameBeenWon(state, ruleset)
  const banner = contextualState(state, ruleset, null)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Scorekeeper</h1>
      <ContextualBanner value={banner} />
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p data-testid="scorekeeper-score" className="text-4xl font-bold text-slate-900">{game.scoreA} – {game.scoreB}</p>
        <p data-testid="scorekeeper-official-call" className="mt-2 text-sm text-slate-500">
          Serving: Team {game.servingTeam} · Call: {officialScoreCall(state, ruleset.format)}
        </p>
        {gameWon ? <p className="mt-2 text-sm font-semibold text-emerald-700">Game point reached.</p> : null}
      </div>
    </div>
  )
}
