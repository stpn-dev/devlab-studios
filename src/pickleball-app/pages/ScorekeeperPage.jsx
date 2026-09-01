import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import { officialScoreCall, contextualState, hasGameBeenWon } from '../../lib/pickleball/scoring/display'
import { can } from '../../lib/pickleball/permissions'
import ContextualBanner from '../components/ContextualBanner'
import ScorekeeperControls from '../components/ScorekeeperControls'
import CorrectionPanel from '../components/CorrectionPanel'

function findServerName(teamList, teamId, currentServerId) {
  if (!teamList) return null
  const team = teamList.find((t) => t.id === teamId)
  const member = team && team.members.find((m) => m.sessionPlayerId === currentServerId)
  return member ? member.displayName : null
}

export default function ScorekeeperPage() {
  const { gameId } = useParams()
  const { sessionId, snapshot, authRole } = useOutletContext()
  const [rulesets, setRulesets] = useState(null)
  const [teams, setTeams] = useState(null)
  const [message, setMessage] = useState(null)
  const [lastOutcome, setLastOutcome] = useState(null)
  const [lastOutcomeGameId, setLastOutcomeGameId] = useState(gameId)

  if (gameId !== lastOutcomeGameId) {
    setLastOutcomeGameId(gameId)
    setLastOutcome(null)
  }

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

  const currentGame = snapshot ? snapshot.games.find((g) => g.id === gameId) : null
  const sessionCourtId = currentGame ? currentGame.sessionCourtId : null

  useEffect(() => {
    let ignore = false
    if (!sessionCourtId) {
      return undefined
    }
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}/courts/${sessionCourtId}/teams`)
      .then((data) => {
        if (!ignore) setTeams(data.teams)
      })
      .catch(() => {
        if (!ignore) setTeams(null)
      })
    return () => {
      ignore = true
    }
  }, [sessionId, sessionCourtId])

  if (!snapshot || rulesets === null) return <p className="text-sm text-slate-500">Loading…</p>

  const game = currentGame
  if (!game) return <p className="text-sm text-rose-600">Game not found.</p>

  const ruleset = rulesets.find((r) => r.id === game.scoringRulesetId)
  if (!ruleset) return <p className="text-sm text-rose-600">Unknown scoring ruleset for this game.</p>

  const state = { scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber }
  const gameWon = hasGameBeenWon(state, ruleset)
  const activeOutcome = lastOutcome && lastOutcome.revision === game.revision ? lastOutcome.outcome : null
  const banner = contextualState(state, ruleset, activeOutcome)
  const canCorrect = can(authRole, 'CORRECT_GAME')

  const teamAServerName = ruleset.format === 'DOUBLES' ? findServerName(teams, game.teamAId, game.teamACurrentServerSessionPlayerId) : null
  const teamBServerName = ruleset.format === 'DOUBLES' ? findServerName(teams, game.teamBId, game.teamBCurrentServerSessionPlayerId) : null

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

  async function handleReopen() {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/reopen`, {})
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleCorrect(correctedState) {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/games/${gameId}/correct`, correctedState)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Scorekeeper</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      <ContextualBanner value={banner} />
      <div className="pb-scoreboard p-6 text-center">
        {game.status === 'IN_PROGRESS' ? (
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-300">
            <span className="pb-live-dot" /> In progress
          </p>
        ) : null}
        <p data-testid="scorekeeper-score" className="pb-score text-6xl text-white">{game.scoreA} – {game.scoreB}</p>
        <p data-testid="scorekeeper-official-call" className="mt-3 text-sm text-slate-300">
          Serving: Team {game.servingTeam} · Call: {officialScoreCall(state, ruleset.format)}
        </p>
      </div>
      <div className="space-y-2">
        <div
          data-testid="scorekeeper-team-a-row"
          className={`flex items-center justify-between rounded-lg border px-4 py-3 shadow-sm ${game.servingTeam === 'A' ? 'border-brand/50 bg-brand/5' : 'border-slate-200 bg-white'}`}
        >
          <div>
            <p className="font-semibold text-slate-900">
              Team A
              {game.servingTeam === 'A' ? (
                <span className="pb-btn-primary ml-2 rounded-full px-2 py-0.5 text-xs">Serving</span>
              ) : null}
            </p>
            {teamAServerName ? <p className="text-xs text-slate-500">Server: {teamAServerName}</p> : null}
          </div>
          <p className="pb-score text-2xl text-slate-900">{game.scoreA}</p>
        </div>
        <div
          data-testid="scorekeeper-team-b-row"
          className={`flex items-center justify-between rounded-lg border px-4 py-3 shadow-sm ${game.servingTeam === 'B' ? 'border-brand/50 bg-brand/5' : 'border-slate-200 bg-white'}`}
        >
          <div>
            <p className="font-semibold text-slate-900">
              Team B
              {game.servingTeam === 'B' ? (
                <span className="pb-btn-primary ml-2 rounded-full px-2 py-0.5 text-xs">Serving</span>
              ) : null}
            </p>
            {teamBServerName ? <p className="text-xs text-slate-500">Server: {teamBServerName}</p> : null}
          </div>
          <p className="pb-score text-2xl text-slate-900">{game.scoreB}</p>
        </div>
      </div>
      {game.status === 'IN_PROGRESS' ? (
        <ScorekeeperControls onRally={handleRally} onUndo={handleUndo} onFinish={handleFinish} isGameWon={gameWon} canScore={!game.correctionPending} />
      ) : null}
      {game.status === 'FINISHED' ? (
        <p className="text-sm text-slate-600">Game finished: {game.finalScoreA} – {game.finalScoreB}.</p>
      ) : null}
      {canCorrect ? <CorrectionPanel game={game} onReopen={handleReopen} onCorrect={handleCorrect} /> : null}
    </div>
  )
}
