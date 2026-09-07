// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: a session closing out — the court goes quiet, standings lock in.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step9CompleteArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* The court, dashed now that play is over. */}
      <rect x="10" y="10" width="60" height="70" rx="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5" />
      <path d="M10 45h60" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.4" />

      {/* The final summary card. */}
      <rect x="78" y="18" width="34" height="54" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="84" y="30" width="22" height="5" rx="2.5" fill="currentColor" opacity="0.8" />
      <rect x="84" y="42" width="22" height="5" rx="2.5" fill="currentColor" opacity="0.6" />
      <rect x="84" y="54" width="14" height="5" rx="2.5" className="text-brand" fill="currentColor" />
    </svg>
  )
}
