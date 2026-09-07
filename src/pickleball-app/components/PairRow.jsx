import { useState } from 'react'
import { ChevronDown, ChevronUp } from '../../components/icons/icons'

/**
 * The FIXED_PAIRS sibling of QueuePlayerRow.jsx -- one row in QueuePage.jsx's
 * "Waiting" list for a session_pair, rather than a single session_player.
 * Same shape (position, fairness stats, `reasons` explainability toggle, one
 * "Leave queue" action) as QueuePlayerRow, just showing both members'
 * display names instead of one -- a pair queues and leaves the queue
 * together (see queueEntries.js's joinQueueAsPair/leaveQueueAsPair), so there
 * is exactly one row and one "Leave queue" action for the whole pair, never
 * two.
 *
 * @param {Object} props
 * @param {number} props.position - 1-based position in the waiting list.
 * @param {{ displayName: string, sessionPlayerId: string }[]} props.players - the pair's two members.
 * @param {number} props.gamesPlayed
 * @param {number} props.waitMinutes
 * @param {string[]} [props.reasons] - explainability lines from selectNextPlayers().
 * @param {() => void} props.onLeave
 */
export default function PairRow({ position, players, gamesPlayed, waitMinutes, reasons = [], onLeave }) {
  const [expanded, setExpanded] = useState(false)
  const hasReasons = reasons.length > 0
  const displayName = players.map((p) => p.displayName).join(' / ')
  const initials = players.map((p) => (p.displayName || '?').trim().charAt(0).toUpperCase() || '?').join('')

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="pb-score w-5 flex-shrink-0 text-right text-sm text-slate-400">{position}</span>
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {initials}
          </span>
          {/* Name and fairness metadata each get their own line and their own
              truncation, same as QueuePlayerRow, so a long combined pair name
              never eats into (or gets eaten by) the "N games · waiting Nm"
              text on a narrow row. */}
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{displayName}</span>
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
              data-testid={`queue-pair-reasons-toggle-${players[0]?.sessionPlayerId}`}
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
          data-testid={`queue-pair-reasons-${players[0]?.sessionPlayerId}`}
        >
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
