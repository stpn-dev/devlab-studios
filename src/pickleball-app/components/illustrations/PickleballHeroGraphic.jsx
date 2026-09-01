// Original, hand-authored SVG (Decision 4) -- not copied from any reference
// image, no third-party vector asset. A paddle silhouette + a perforated
// ball, the app's two most recognizable shapes, kept to a handful of
// `<path>`/`<circle>` elements rather than an elaborate multi-layer scene.
// `currentColor`-based so it inherits from whatever text color the caller
// (usually EmptyState.jsx) sets -- no hex value is introduced here. Purely
// decorative: `aria-hidden` and no embedded text, per Decision 4.
//
// Used as the "no active session" hero graphic on DashboardPage.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function PickleballHeroGraphic({ className = '' }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      {/* Paddle: rounded head + short handle. */}
      <path d="M34 14c14 0 24 10.5 24 24S48 62 34 62 10 51.5 10 38 20 14 34 14Z" stroke="currentColor" strokeWidth="3" />
      <path d="M34 62v16M27 84h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {/* Ball, tucked beside the paddle, with a few perforation dots. */}
      <circle cx="72" cy="68" r="15" stroke="currentColor" strokeWidth="3" />
      <circle cx="72" cy="59" r="1.6" fill="currentColor" />
      <circle cx="65" cy="68" r="1.6" fill="currentColor" />
      <circle cx="79" cy="68" r="1.6" fill="currentColor" />
      <circle cx="72" cy="77" r="1.6" fill="currentColor" />
    </svg>
  )
}
