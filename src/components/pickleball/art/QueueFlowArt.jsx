// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: the waiting queue resolving onto a court.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function QueueFlowArt({ className = '' }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={className} aria-hidden="true">
      {/* Four queued players, front of the queue at the top. */}
      <rect x="8" y="14" width="44" height="16" rx="8" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="38" width="44" height="16" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <rect x="8" y="62" width="44" height="16" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="8" y="86" width="44" height="16" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />

      {/* Selection arrow. */}
      <path d="M62 22h26m0 0-7-6m7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand" />

      {/* The court they land on. */}
      <rect x="96" y="30" width="56" height="60" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M96 60h56" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="112" cy="46" r="4.5" fill="currentColor" />
      <circle cx="136" cy="46" r="4.5" fill="currentColor" />
      <circle cx="112" cy="74" r="4.5" fill="currentColor" opacity="0.6" />
      <circle cx="136" cy="74" r="4.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}
