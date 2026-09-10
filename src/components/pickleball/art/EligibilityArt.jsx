// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: which games reach the average. Four games approach one gate;
// the finished open-play ones pass through solid, the rest stop short and
// stay hollow. The gate is the point, so it carries the accent.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function EligibilityArt({ className = '' }) {
  return (
    <svg viewBox="0 0 320 140" fill="none" className={className} aria-hidden="true">
      {/* The gate. */}
      <path d="M168 14v112" stroke="currentColor" strokeWidth="2" className="text-brand" />
      <path d="M160 20h16M160 120h16" stroke="currentColor" strokeWidth="2" className="text-brand" opacity="0.5" strokeLinecap="round" />

      {/* Two games that count: solid, already through, feeding the stack. */}
      <rect x="196" y="24" width="52" height="18" rx="9" fill="currentColor" className="text-brand" />
      <path d="M136 33h44" stroke="currentColor" strokeWidth="2" className="text-brand" strokeLinecap="round" />
      <circle cx="122" cy="33" r="8" fill="currentColor" className="text-brand" />

      <rect x="196" y="52" width="40" height="18" rx="9" fill="currentColor" className="text-brand" opacity="0.75" />
      <path d="M136 61h44" stroke="currentColor" strokeWidth="2" className="text-brand" opacity="0.75" strokeLinecap="round" />
      <circle cx="122" cy="61" r="8" fill="currentColor" className="text-brand" opacity="0.75" />

      {/* Two games that don't: hollow, stopped, with the path broken. */}
      <circle cx="122" cy="89" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <path d="M136 89h10M152 89h6" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
      <path d="M144 83l10 12" stroke="currentColor" strokeWidth="1.5" opacity="0.45" strokeLinecap="round" />

      <circle cx="122" cy="115" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.28" />
      <path d="M136 115h10M152 115h6" stroke="currentColor" strokeWidth="1.5" opacity="0.22" strokeLinecap="round" />
      <path d="M144 109l10 12" stroke="currentColor" strokeWidth="1.5" opacity="0.32" strokeLinecap="round" />

      {/* The running average the passing games build. */}
      <rect x="196" y="86" width="76" height="34" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M206 112l14-14 12 8 14-18" stroke="currentColor" strokeWidth="2" className="text-brand" strokeLinecap="round" strokeLinejoin="round" />

      {/* Left margin rule: the pool of played games. */}
      <path d="M98 22v100" stroke="currentColor" strokeWidth="1.5" opacity="0.2" strokeLinecap="round" />
    </svg>
  )
}
