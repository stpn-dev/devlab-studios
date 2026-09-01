import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import { contextualState, hasGameBeenWon } from '../../lib/pickleball/scoring/display'
import { hasPermission } from '../../lib/pickleball/permissions'
import ContextualBanner from '../components/ContextualBanner'
import GameScoreboard from '../components/GameScoreboard'
import RallyActionPanel from '../components/RallyActionPanel'
import CorrectionPanel from '../components/CorrectionPanel'
import { SkeletonBlock, SkeletonLine } from '../components/SkeletonLoader'

function findServerName(teamList, teamId, currentServerId) {
  if (!teamList) return null
  const team = teamList.find((t) => t.id === teamId)
  const member = team && team.members.find((m) => m.sessionPlayerId === currentServerId)
  return member ? member.displayName : null
}

export default function ScorekeeperPage() {
  const { gameId } = useParams()
  const { sessionId, snapshot, authRole, isPlatformAdmin } = useOutletContext()
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

  if (!snapshot || rulesets === null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Scorekeeper</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        <SkeletonBlock>
          {/* Mirrors `.pb-scoreboard`'s own dark card so the skeleton doesn't
              flash a mismatched light box just before the real scoreboard
              replaces it -- bars use a light-on-dark tint instead of
              SkeletonLine's slate-200 default, since this card's background
              is dark. */}
          <div className="pb-scoreboard space-y-4 p-6">
            <SkeletonLine tone="dark" className="h-3 w-1/4" />
            <SkeletonLine tone="dark" className="h-10 w-2/3" />
            <SkeletonLine tone="dark" className="h-3 w-1/3" />
          </div>
        </SkeletonBlock>
      </div>
    )
  }

  const game = currentGame
  if (!game) return <p className="text-sm text-rose-600">Game not found.</p>

  const ruleset = rulesets.find((r) => r.id === game.scoringRulesetId)
  if (!ruleset) return <p className="text-sm text-rose-600">Unknown scoring ruleset for this game.</p>

  const state = { scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber }
  const gameWon = hasGameBeenWon(state, ruleset)
  const activeOutcome = lastOutcome && lastOutcome.revision === game.revision ? lastOutcome.outcome : null
  const banner = contextualState(state, ruleset, activeOutcome)
  const canCorrect = hasPermission({ role: authRole, isPlatformAdmin }, 'CORRECT_GAME')

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
    // Mobile-first ordering (brief §29): header -> teams/score -> serve info
    // -> context -> rally actions. "Serve info" (Serving: Team X · Call: …)
    // lives inside GameScoreboard itself, directly under the team/score
    // columns, so it already lands in the right slot without a separate
    // element here.
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Scorekeeper</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      {game.status === 'IN_PROGRESS' ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700">
          <span className="pb-live-dot" /> In progress
        </p>
      ) : null}

      {/* Teams/score + serve info -- GameScoreboard's full variant (Task 3),
          wired to this page's own snapshot-derived `game`, never a
          recomputed/duplicated copy of it. No `ruleset` is passed: that would
          make GameScoreboard compute its own contextual (game-point/tied/
          side-out) chip via `contextualState(state, ruleset, null)` --
          always passing `null` for `lastOutcome`, which can never report
          SIDE_OUT the way this page's own `banner` (below) correctly does
          via `activeOutcome`. Passing `ruleset` here would both duplicate
          ContextualBanner's chip AND silently drop the side-out case, so the
          contextual read stays solely ContextualBanner's job. */}
      <GameScoreboard
        game={game}
        variant="full"
        teamAServerName={teamAServerName}
        teamBServerName={teamBServerName}
        scoreTestId="scorekeeper-score"
        officialCallTestId="scorekeeper-official-call"
        teamATestId="scorekeeper-team-a-row"
        teamBTestId="scorekeeper-team-b-row"
      />

      {/* Context -- game-point/tied-win-by-2/side-out, driven by this page's
          own `banner` (which folds in `activeOutcome` from the last rally),
          not GameScoreboard's internal (and side-out-blind) computation. */}
      <ContextualBanner value={banner} />

      {/* Rally actions -- the only scoring input on this screen. */}
      {game.status === 'IN_PROGRESS' ? (
        <RallyActionPanel
          teamAName="TEAM A"
          teamBName="TEAM B"
          onTeamAWon={() => handleRally('A')}
          onTeamBWon={() => handleRally('B')}
          onUndo={handleUndo}
          onFinish={handleFinish}
          isGameWon={gameWon}
          canScore={!game.correctionPending}
        />
      ) : null}
      {game.status === 'FINISHED' ? (
        <p className="text-sm text-slate-600">Game finished: {game.finalScoreA} – {game.finalScoreB}.</p>
      ) : null}
      {canCorrect ? <CorrectionPanel game={game} onReopen={handleReopen} onCorrect={handleCorrect} /> : null}
    </div>
  )
}
