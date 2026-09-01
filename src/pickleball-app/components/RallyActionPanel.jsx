// Extracted from ScorekeeperControls.jsx (visual pass only -- Task 6). The
// rally-winner buttons remain the ONLY scoring input on this screen: no
// manual +/- score control and no manual "side out" button were added here,
// per the redesign's hard, non-negotiable constraint. Every handler below is
// called with the exact same arguments ScorekeeperControls already used --
// this component only restyles the container/buttons into larger,
// mobile-thumb-friendly targets.
//
// `teamAName`/`teamBName` default to the literal "TEAM A"/"TEAM B" labels
// ScorekeeperPage.jsx has always used for these buttons -- this page's data
// has no per-team display name (only per-*player* server names, threaded
// separately through GameScoreboard's teamAServerName/teamBServerName), so
// there is no "real" team name to prefer here. The props exist so a future
// caller with real team names can pass them without any change to this
// component, but ScorekeeperPage itself intentionally keeps passing the
// literal "TEAM A"/"TEAM B" strings, matching the existing (and
// Playwright-asserted) "TEAM A WON RALLY" / "TEAM B WON RALLY" button names.
//
// @param {Object} props
// @param {string} [props.teamAName]
// @param {string} [props.teamBName]
// @param {() => void} props.onTeamAWon
// @param {() => void} props.onTeamBWon
// @param {() => void} props.onUndo
// @param {() => void} props.onFinish
// @param {boolean} props.isGameWon - true once the score already satisfies
//   the ruleset's win condition (`hasGameBeenWon`) -- disables further rally
//   submission and reveals "Finish game", exactly as ScorekeeperControls did.
// @param {boolean} props.canScore - false while `game.correctionPending` is
//   set; hides the rally/undo buttons entirely (same gate as before).
export default function RallyActionPanel({
  teamAName = 'TEAM A',
  teamBName = 'TEAM B',
  onTeamAWon,
  onTeamBWon,
  onUndo,
  onFinish,
  isGameWon,
  canScore,
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {canScore ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={isGameWon}
              onClick={onTeamAWon}
              className="pb-btn-primary rounded-lg px-4 py-4 text-base tracking-wide"
            >
              {teamAName} WON RALLY
            </button>
            <button
              type="button"
              disabled={isGameWon}
              onClick={onTeamBWon}
              className="pb-btn-primary rounded-lg px-4 py-4 text-base tracking-wide"
            >
              {teamBName} WON RALLY
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onUndo}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              UNDO LAST RALLY
            </button>
            {isGameWon ? (
              <button
                type="button"
                onClick={onFinish}
                className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Finish game
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-700">This game is under correction. Rallies are paused until it's finished again.</p>
          {isGameWon ? (
            <button
              type="button"
              onClick={onFinish}
              className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Finish game
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
