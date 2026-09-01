import { officialScoreCall, contextualState, hasGameBeenWon } from '../../lib/pickleball/scoring/display'

// Same copy ContextualBanner.jsx already uses for SIDE_OUT/GAME_POINT/
// TIED_WIN_BY_TWO -- kept as its own small map here (rather than importing
// ContextualBanner) so this component owns its own compact chip markup, but
// the STRINGS themselves must stay identical to ContextualBanner's, since
// both ultimately describe the same `contextualState` return value.
const CONTEXTUAL_COPY = {
  SIDE_OUT: { text: 'Side out', className: 'bg-amber-100 text-amber-800' },
  GAME_POINT: { text: 'Game point', className: 'bg-rose-100 text-rose-800' },
  TIED_WIN_BY_TWO: { text: 'Tied — win by two', className: 'bg-sky-100 text-sky-800' },
}

/**
 * A team's name/label plus an optional "Serving" pill -- used either side of
 * the full-variant scoreboard. Never renders a score itself: the two scores
 * always stay joined as one literal "scoreA – scoreB" run (see the compact
 * branch below and `TeamName`'s full-variant sibling `<p className="pb-score">`)
 * so this component's plain-text score keeps matching the exact "N – N"
 * format the rest of the app (and its e2e coverage) already renders.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {boolean} props.serving
 */
function TeamLabel({ label, serving }) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-100">
      {label}
      {serving ? (
        <span className="pb-btn-primary rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide">Serving</span>
      ) : null}
    </p>
  )
}

/**
 * The shared "broadcast" scoreboard for a single game -- team labels, both
 * scores, a serving indicator, the official score call, and (when a
 * ruleset is supplied) the game-point/tied-win-by-2 contextual state. Every
 * one of those last three comes from the existing
 * src/lib/pickleball/scoring/display helpers (officialScoreCall/
 * contextualState/hasGameBeenWon) -- this component reads their output, it
 * never re-derives win-by-2, game-point, or official-call logic itself.
 *
 * `ruleset` is optional: `officialScoreCall` only needs `game.format`
 * (always present on a game row), but `contextualState`/`hasGameBeenWon`
 * need the scoring ruleset's targetScore/winBy. A caller with no ruleset in
 * scope (e.g. a list page that never fetches one) simply doesn't get that
 * extra text -- it is never approximated locally.
 *
 * `compact` renders the two scores as a single "scoreA – scoreB" line
 * (matching the format GamesListPage/CourtsPage already rendered before
 * this component existed) instead of the full variant's large two-column
 * scores either side of a "vs" divider, and drops server names.
 *
 * @param {Object} props
 * @param {Object} props.game - one entry from a session snapshot's `games`
 *   array (scoreA/scoreB/servingTeam/serverNumber/format/status required).
 * @param {'full'|'compact'} [props.variant]
 * @param {{targetScore:number, winBy:number}|null} [props.ruleset]
 * @param {string|null} [props.teamAServerName]
 * @param {string|null} [props.teamBServerName]
 * @param {string} [props.className]
 */
export default function GameScoreboard({
  game,
  variant = 'full',
  ruleset = null,
  teamAServerName = null,
  teamBServerName = null,
  className = '',
}) {
  const compact = variant === 'compact'
  const state = { scoreA: game.scoreA, scoreB: game.scoreB, servingTeam: game.servingTeam, serverNumber: game.serverNumber }
  const officialCall = officialScoreCall(state, game.format)
  const contextual = ruleset ? contextualState(state, ruleset, null) : null
  const contextualCopy = contextual ? CONTEXTUAL_COPY[contextual] : null
  const gameWon = ruleset ? hasGameBeenWon(state, ruleset) : false

  return (
    <div data-testid="game-scoreboard" className={`pb-scoreboard ${compact ? 'p-4' : 'p-6'} text-center ${className}`}>
      {contextualCopy ? (
        <p className={`mb-2 inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide shadow-sm ${contextualCopy.className}`}>
          {contextualCopy.text}
        </p>
      ) : null}

      {compact ? (
        <div className="flex items-center justify-between gap-3">
          <TeamLabel label="Team A" serving={game.servingTeam === 'A'} />
          <p className="pb-score text-3xl text-white">
            {game.scoreA} – {game.scoreB}
          </p>
          <TeamLabel label="Team B" serving={game.servingTeam === 'B'} />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-1 flex-col items-center gap-1">
            <TeamLabel label="Team A" serving={game.servingTeam === 'A'} />
            <p className="pb-score text-6xl text-white">{game.scoreA}</p>
            {teamAServerName ? <p className="text-xs text-slate-400">Server: {teamAServerName}</p> : null}
          </div>
          <span className="pb-eyebrow text-slate-400">vs</span>
          <div className="flex flex-1 flex-col items-center gap-1">
            <TeamLabel label="Team B" serving={game.servingTeam === 'B'} />
            <p className="pb-score text-6xl text-white">{game.scoreB}</p>
            {teamBServerName ? <p className="text-xs text-slate-400">Server: {teamBServerName}</p> : null}
          </div>
        </div>
      )}

      <p className={`mt-3 text-slate-300 ${compact ? 'text-xs' : 'text-sm'}`}>
        Serving: Team {game.servingTeam}
        {!compact ? ` · Call: ${officialCall}` : null}
      </p>

      {gameWon ? <p className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-300">Game complete</p> : null}
    </div>
  )
}
