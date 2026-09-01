// Original, hand-authored SVG (Decision 4) -- two crossed paddles (an
// ellipse head + a short handle line, mirrored and rotated), suggesting a
// match ready to be scheduled. `currentColor`-based, four shapes total,
// `aria-hidden`, no embedded text.
//
// Used for SessionsListPage's "no sessions yet" empty state.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function EmptySessionGraphic({ className = '' }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <g transform="rotate(-28 48 48)">
        <ellipse cx="48" cy="34" rx="16" ry="20" stroke="currentColor" strokeWidth="3" />
        <line x1="48" y1="54" x2="48" y2="80" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="rotate(28 48 48)">
        <ellipse cx="48" cy="34" rx="16" ry="20" stroke="currentColor" strokeWidth="3" />
        <line x1="48" y1="54" x2="48" y2="80" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  )
}
