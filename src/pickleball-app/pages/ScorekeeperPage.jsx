import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import { officialScoreCall, contextualState, hasGameBeenWon } from '../../lib/pickleball/scoring/display'
import ContextualBanner from '../components/ContextualBanner'
import ScorekeeperControls from '../components/ScorekeeperControls'

export default function ScorekeeperPage() {
  const { gameId } = useParams()
  const { sessionId, snapshot } = useOutletContext()
  const [rulesets, setRulesets] = useState(null)
  const [message, setMessage] = useState(null)
  const [lastOutcome, setLastOutcome] = useState(null)

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
  const activeOutcome = lastOutcome && lastOutcome.revision === game.revision ? lastOutcome.outcome : null
  const banner = contextualState(state, ruleset, activeOutcome)

  async function handleRally(winningTeam) {
    setMessage(null)
    try {
      const result = await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/rally`, { winningTeam })
      setLastOutcome({ revision: result.game.revision, outcome: result.outcome })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleUndo() {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/undo`, {})
      setLastOutcome(null)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleFinish() {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/finish`, {})
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Scorekeeper</h1>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      <ContextualBanner value={banner} />
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p data-testid="scorekeeper-score" className="text-4xl font-bold text-slate-900">{game.scoreA} – {game.scoreB}</p>
        <p data-testid="scorekeeper-official-call" className="mt-2 text-sm text-slate-500">
          Serving: Team {game.servingTeam} · Call: {officialScoreCall(state, ruleset.format)}
        </p>
      </div>
      {game.status === 'IN_PROGRESS' && !game.correctionPending ? (
        <ScorekeeperControls onRally={handleRally} onUndo={handleUndo} onFinish={handleFinish} isGameWon={gameWon} />
      ) : null}
      {game.status === 'IN_PROGRESS' && game.correctionPending ? (
        <p className="text-sm text-amber-700">This game is under correction. Use the correction panel below.</p>
      ) : null}
      {game.status === 'FINISHED' ? (
        <p className="text-sm text-slate-600">Game finished: {game.finalScoreA} – {game.finalScoreB}.</p>
      ) : null}
    </div>
  )
}
