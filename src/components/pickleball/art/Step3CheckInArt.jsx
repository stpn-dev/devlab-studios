// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: players checking in as they arrive, one still waiting.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step3CheckInArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* Three players, top two already checked in. */}
      <circle cx="24" cy="20" r="5" fill="currentColor" />
      <rect x="36" y="12" width="70" height="16" rx="8" stroke="currentColor" strokeWidth="2" />
      <path d="M44 20.5 48 24.5 56 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand" />

      <circle cx="24" cy="45" r="5" fill="currentColor" opacity="0.75" />
      <rect x="36" y="37" width="70" height="16" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
      <path d="M44 45.5 48 49.5 56 41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />

      <circle cx="24" cy="70" r="5" fill="currentColor" opacity="0.4" />
      <rect x="36" y="62" width="70" height="16" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  )
}
