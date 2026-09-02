import { Sparkles } from '../../components/icons/icons'

/**
 * "Why these players" preview for an AVAILABLE court on CourtsPage.jsx,
 * embedded inside CourtCard.jsx. Surfaces the same `selectNextPlayers()`
 * fairness reasoning the Queue page's `reasons` list already exposes
 * (spec Decision 7) -- CourtsPage.jsx computes `candidates` by sorting the
 * session snapshot's already-fetched queue entries (fewest games played,
 * then longest wait -- rules 1+2 of `selectNextPlayers`'s ordering) and
 * slicing to the eligible ones with non-empty `reasons`. It cannot
 * reproduce rule 3 (repeat-avoidance), which needs server-only
 * `lastPairedWith` data, so the last shown candidate can occasionally
 * differ from who the server actually seats -- see CourtsPage.jsx's
 * `recommendedCandidates()` comment for the full explanation. The copy
 * below is deliberately framed as "candidates," not "the match," since only
 * some of them will actually be seated (SINGLES seats 2, DOUBLES seats 4,
 * and this list is always capped at 4 regardless of format).
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
 * @param {string} [props.courtId] - the owning court's id, used to key this
 *   card's `data-testid` -- CourtsPage.jsx renders one of these per
 *   AVAILABLE court, so a bare static testid would violate Playwright's
 *   strict mode as soon as more than one court is AVAILABLE at once.
 * @param {boolean} [props.previewShownElsewhere] - true when `candidates`
 *   is empty here only because CourtsPage.jsx is already showing the
 *   (non-empty) preview on a different AVAILABLE court, not because the
 *   queue is actually empty. Swaps the empty-state copy from "No eligible
 *   players queued yet." (which would be false in that case) to a pointer
 *   at where the preview actually is.
 * @param {string} [props.previewCourtName] - the court name to reference in
 *   `previewShownElsewhere`'s copy; falls back to generic phrasing if unset.
 */
export default function RecommendedMatchCard({ candidates = [], onAssign, courtId, previewShownElsewhere = false, previewCourtName }) {
  return (
    <div
      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      data-testid={courtId ? `recommended-match-card-${courtId}` : 'recommended-match-card'}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        Recommended next players
      </div>

      {candidates.length ? (
        <>
          <ul className="space-y-1.5">
            {candidates.map((candidate) => (
              <li key={candidate.sessionPlayerId} className="truncate text-sm">
                <span className="font-medium text-slate-900">{candidate.displayName}</span>
                {candidate.reasons?.[0] ? <span className="text-xs text-slate-500"> — {candidate.reasons[0]}</span> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Top eligible candidates by fairness order. Assign will automatically pick and pair the actual match from this
            group.
          </p>
        </>
      ) : previewShownElsewhere ? (
        <p className="text-sm text-slate-500">
          Recommended players shown on {previewCourtName ? previewCourtName : 'the first open court'}.
        </p>
      ) : (
        <p className="text-sm text-slate-500">No eligible players queued yet.</p>
      )}

      <button type="button" onClick={onAssign} className="pb-btn-primary inline-flex min-h-11 w-full items-center justify-center rounded px-3 text-xs">
        Assign
      </button>
    </div>
  )
}
