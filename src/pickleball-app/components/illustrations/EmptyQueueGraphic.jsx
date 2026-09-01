// Original, hand-authored SVG (Decision 4) -- a ball (with a few
// perforation dots) followed by two smaller, fading circles suggesting a
// motion trail -- read here as a queue/line trailing off to nothing.
// `currentColor`-based (opacity thins the trailing circles, no new color),
// `aria-hidden`, no embedded text.
//
// Used for QueuePage's "nobody waiting" empty state.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function EmptyQueueGraphic({ className = '' }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <circle cx="70" cy="48" r="14" stroke="currentColor" strokeWidth="3" />
      <circle cx="70" cy="40" r="1.4" fill="currentColor" />
      <circle cx="63" cy="48" r="1.4" fill="currentColor" />
      <circle cx="77" cy="48" r="1.4" fill="currentColor" />
      <circle cx="41" cy="48" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.55" />
      <circle cx="19" cy="48" r="5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
    </svg>
  )
}
