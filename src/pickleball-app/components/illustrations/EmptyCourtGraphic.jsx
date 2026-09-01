// Original, hand-authored SVG (Decision 4) -- an abstract court diagram:
// the boundary rectangle, a center line, and the two non-volley-zone
// ("kitchen") lines, all `currentColor`-based and built from a rect + three
// lines -- nothing more elaborate. `aria-hidden`, no embedded text.
//
// Used for CourtsPage's "no courts configured" empty state.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function EmptyCourtGraphic({ className = '' }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <rect x="10" y="20" width="76" height="56" rx="4" stroke="currentColor" strokeWidth="3" />
      <line x1="48" y1="20" x2="48" y2="76" stroke="currentColor" strokeWidth="3" />
      <line x1="10" y1="38" x2="86" y2="38" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
      <line x1="10" y1="58" x2="86" y2="58" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
    </svg>
  )
}
