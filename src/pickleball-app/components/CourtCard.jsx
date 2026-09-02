import { Grid3x3, Swords, CheckCircle2, Wrench } from '../../components/icons/icons'
import GameScoreboard from './GameScoreboard'
import RecommendedMatchCard from './RecommendedMatchCard'

// Icon + label pair for each of the three court-state visual treatments.
// `status` here is the CALLER's already-derived display state (LIVE/
// AVAILABLE/OUT_OF_SERVICE) -- CourtsPage.jsx computes it from the court's
// raw `status`/`enabled` fields, this component never re-derives it. Every
// state is communicated by this icon + its label text, never by the card's
// accent color alone.
const STATE_CONFIG = {
  LIVE: { icon: Swords, cardClassName: 'pb-court-card--live', label: 'In play' },
  AVAILABLE: { icon: CheckCircle2, cardClassName: 'pb-court-card--available', label: 'Ready for next match' },
  OUT_OF_SERVICE: { icon: Wrench, cardClassName: 'pb-court-card--out-of-service', label: 'Out of service' },
}

/**
 * A single court's card on CourtsPage.jsx -- three visual treatments
 * (LIVE/AVAILABLE/OUT_OF_SERVICE), each an icon + text label so the state
 * never reads through color alone. Preserves the exact action wiring
 * CourtsPage.jsx already had (same handlers, same raw-field conditions for
 * which buttons show), just presented inside a richer container.
 *
 * @param {Object} props
 * @param {Object} props.court - one entry from a session snapshot's `courts`
 *   array (id/courtName/status required).
 * @param {'LIVE'|'AVAILABLE'|'OUT_OF_SERVICE'} props.status - the caller's
 *   already-derived display state (see STATE_CONFIG comment above).
 * @param {boolean} props.enabled - the court's live enabled flag (tracked
 *   separately by CourtsPage.jsx, since disabling doesn't change `court.status`).
 * @param {Object|null} [props.game] - this court's current IN_PROGRESS game,
 *   if any (only rendered when status is LIVE).
 * @param {Array<{ sessionPlayerId: string, displayName: string, reasons?: string[] }>} [props.recommended]
 *   - the fairness-ranked queue candidates CourtsPage.jsx computed for the
 *   "recommended next match" preview (only rendered when this court is
 *   AVAILABLE and assignable).
 * @param {() => void} [props.onAssign]
 * @param {() => void} [props.onRelease]
 * @param {() => void} [props.onEnable]
 * @param {() => void} [props.onDisable]
 * @param {() => void} [props.onOpen] - opens the live game's Scorekeeper view.
 */
export default function CourtCard({ court, status, enabled, game = null, recommended = [], onAssign, onRelease, onEnable, onDisable, onOpen }) {
  const config = STATE_CONFIG[status] || STATE_CONFIG.AVAILABLE
  const StateIcon = config.icon
  const showAssign = court.status === 'AVAILABLE' && enabled !== false
  const showRelease = court.status === 'ASSIGNED'

  return (
    <div
      data-testid={`court-card-${court.id}`}
      className={`pb-court-card space-y-3 p-4 ${config.cardClassName}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900">
          <Grid3x3 className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">{court.courtName}</span>
        </span>
        {/* text-slate-600, not -500: Task 10's contrast audit found -500
            drops to 3.97:1 against the OUT_OF_SERVICE card's --surface-alt
            background (below WCAG AA's 4.5:1 for this text-xs run) --
            -600 clears 4.5:1 against every one of this card's backgrounds
            (6.3-7.4:1 measured), so one color works for all three states. */}
        <span className="flex flex-shrink-0 items-center gap-1.5 text-xs text-slate-600">
          {court.status === 'ASSIGNED' ? <span className="pb-live-dot" /> : null}
          {court.status}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <StateIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" strokeWidth={2} />
        <span>{config.label}</span>
      </div>

      {status === 'LIVE' ? (
        game ? (
          <button
            type="button"
            onClick={onOpen}
            disabled={!onOpen}
            className="pb-focus-on-dark block w-full rounded-lg text-left disabled:cursor-default"
          >
            <GameScoreboard game={game} variant="compact" />
          </button>
        ) : (
          <p className="text-sm text-slate-500">Waiting for the game to start.</p>
        )
      ) : null}

      {showAssign ? <RecommendedMatchCard candidates={recommended} onAssign={onAssign} /> : null}

      <div className="flex flex-wrap gap-2">
        {showRelease ? (
          <button type="button" onClick={onRelease} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50">
            Release
          </button>
        ) : null}
        {enabled === false ? (
          <button type="button" onClick={onEnable} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50">
            Enable
          </button>
        ) : (
          <button type="button" onClick={onDisable} className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50">
            Disable
          </button>
        )}
      </div>
    </div>
  )
}
