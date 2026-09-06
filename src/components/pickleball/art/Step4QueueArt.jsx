// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: the waiting queue, ordered front to back.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step4QueueArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* Order column — front of the queue is brightest. */}
      <circle cx="16" cy="15" r="3.5" className="text-brand" fill="currentColor" />
      <circle cx="16" cy="35" r="3.5" fill="currentColor" opacity="0.7" />
      <circle cx="16" cy="55" r="3.5" fill="currentColor" opacity="0.5" />
      <circle cx="16" cy="75" r="3.5" fill="currentColor" opacity="0.3" />

      {/* Four queued players, waiting longest at the top. */}
      <rect x="28" y="8" width="84" height="14" rx="7" stroke="currentColor" strokeWidth="2" />
      <rect x="28" y="28" width="84" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <rect x="28" y="48" width="84" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="28" y="68" width="84" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  )
}
