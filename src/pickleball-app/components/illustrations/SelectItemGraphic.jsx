// Original, hand-authored SVG (Decision 4) -- a simple "tap to select" motif:
// a rounded-rectangle card outline with a pointer/cursor arrow resting on
// it, built from a rect + a path + a small circle -- nothing more elaborate.
// `currentColor`-based, `aria-hidden`, no embedded text.
//
// Used for PlayersPage/VenuesPage's "nothing selected yet" detail-pane state
// (a master/detail layout with no item picked has no other content to show).

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function SelectItemGraphic({ className = '' }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <rect x="12" y="16" width="56" height="64" rx="6" stroke="currentColor" strokeWidth="3" />
      <line x1="22" y1="34" x2="58" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line x1="22" y1="48" x2="48" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M52 56 L84 72 L70 76 L64 90 Z" fill="currentColor" />
    </svg>
  )
}
