// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: the top of the queue flowing onto a free court.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step5AssignArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* Two players pulled from the front of the queue. */}
      <rect x="4" y="20" width="36" height="14" rx="7" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="56" width="36" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />

      {/* The pick, flowing onto the court. */}
      <path d="M44 45h20m0 0-7-6m7 6-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand" />

      {/* The court, now holding a balanced foursome. */}
      <rect x="68" y="10" width="44" height="70" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M68 45h44" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="80" cy="28" r="4" fill="currentColor" />
      <circle cx="100" cy="28" r="4" fill="currentColor" />
      <circle cx="80" cy="62" r="4" fill="currentColor" opacity="0.7" />
      <circle cx="100" cy="62" r="4" fill="currentColor" opacity="0.7" />
    </svg>
  )
}
