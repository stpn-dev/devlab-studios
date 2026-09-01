import { Sparkles } from '../../components/icons/icons'

/**
 * "Why these players" preview for an AVAILABLE court on CourtsPage.jsx,
 * embedded inside CourtCard.jsx. Surfaces the same `selectNextPlayers()`
 * fairness reasoning the Queue page's `reasons` list already exposes
 * (spec Decision 7) -- CourtsPage.jsx computes `candidates` by sorting the
 * session snapshot's already-fetched queue entries (fewest games played,
 * then longest wait -- the exact ordering `selectNextPlayers` itself uses)
 * and slicing to the eligible ones with non-empty `reasons`.
 *
 * Deliberately does NOT call any new assignment API: `onAssign` is the
 * *same* handler CourtCard.jsx already wired to `POST /courts/assign`
 * (CourtsPage.jsx's `onAssign` prop, unchanged) -- this component only adds
 * an explainability preview in front of that existing action, it never
 * invents a "assign these specific players" endpoint (the real
 * SessionCoordinatorDO.assignCourt call still picks/balances players
 * server-side, authoritatively, exactly as it did before this task).
 *
 * @param {Object} props
 * @param {Array<{ sessionPlayerId: string, displayName: string, reasons?: string[] }>} [props.candidates]
 * @param {() => void} props.onAssign
 */
export default function RecommendedMatchCard({ candidates = [], onAssign }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="recommended-match-card">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        Recommended next match
      </div>

      {candidates.length ? (
        <ul className="space-y-1.5">
          {candidates.map((candidate) => (
            <li key={candidate.sessionPlayerId} className="truncate text-sm">
              <span className="font-medium text-slate-900">{candidate.displayName}</span>
              {candidate.reasons?.[0] ? <span className="text-xs text-slate-500"> — {candidate.reasons[0]}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No eligible players queued yet.</p>
      )}

      <button type="button" onClick={onAssign} className="pb-btn-primary w-full rounded px-3 py-1.5 text-xs">
        Assign
      </button>
    </div>
  )
}
