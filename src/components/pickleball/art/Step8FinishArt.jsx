// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: a game locked in as final, and the standings it updates.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step7FinishArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* The final scoreline. */}
      <rect x="10" y="10" width="30" height="20" rx="4" stroke="currentColor" strokeWidth="2" />
      <rect x="50" y="10" width="30" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
      <path d="M42 20h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      {/* A small win mark for the finished game. */}
      <path d="M92 8l6 6-6 6-6-6z" stroke="currentColor" strokeWidth="1.5" className="text-brand" strokeLinejoin="round" />

      {/* Updated standings — a ranked list of three. */}
      <rect x="10" y="48" width="90" height="8" rx="4" fill="currentColor" opacity="0.85" />
      <rect x="10" y="62" width="70" height="8" rx="4" fill="currentColor" opacity="0.6" />
      <rect x="10" y="76" width="50" height="8" rx="4" fill="currentColor" opacity="0.4" />
    </svg>
  )
}
