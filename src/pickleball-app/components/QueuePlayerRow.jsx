import { useState } from 'react'
import { ChevronDown, ChevronUp } from '../../components/icons/icons'

/**
 * One row in QueuePage.jsx's "Waiting" list -- position, player identity,
 * fairness stats, and (when present) the `reasons` explainability list
 * `selectNextPlayers()` already attaches to every eligible queue entry
 * (`GET /api/pickleball/sessions/[id]/queue` -- spec Decision 7). Entries the
 * fairness engine didn't consider eligible (not checked in, not available,
 * etc.) come through with an empty `reasons` array, in which case no
 * "Why?" toggle is rendered at all.
 *
 * Preserves the exact "Leave queue" action/handler QueuePage.jsx already
 * had -- same button text, same rounded/rose styling -- just relocated into
 * this row component so QueuePage.jsx can pass its existing `handleLeave`
 * through as `onLeave`.
 *
 * @param {Object} props
 * @param {number} props.position - 1-based position in the waiting list.
 * @param {{ displayName: string, sessionPlayerId: string }} props.player
 * @param {number} props.gamesPlayed
 * @param {number} props.waitMinutes
 * @param {string[]} [props.reasons] - explainability lines from selectNextPlayers().
 * @param {() => void} props.onLeave
 */
export default function QueuePlayerRow({ position, player, gamesPlayed, waitMinutes, reasons = [], onLeave }) {
  const [expanded, setExpanded] = useState(false)
  const hasReasons = reasons.length > 0
  const initial = (player.displayName || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="pb-score w-5 flex-shrink-0 text-right text-sm text-slate-400">{position}</span>
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {initial}
          </span>
          {/* Name and fairness metadata each get their own line and their own
              truncation, so a long display name never eats into (or gets
              eaten by) the "N games · waiting Nm" text on a narrow row. */}
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{player.displayName}</span>
            <span className="block truncate text-xs text-slate-400">
              {gamesPlayed} {gamesPlayed === 1 ? 'game' : 'games'} · waiting {waitMinutes}m
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
          {hasReasons ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex min-h-11 items-center gap-1 rounded border border-slate-200 px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              aria-expanded={expanded}
              data-testid={`queue-reasons-toggle-${player.sessionPlayerId}`}
            >
              Why?
              {expanded ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex min-h-11 items-center justify-center rounded border border-rose-300 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
          >
            Leave queue
          </button>
        </div>
      </div>
      {hasReasons && expanded ? (
        <ul
          className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500"
          data-testid={`queue-reasons-${player.sessionPlayerId}`}
        >
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
