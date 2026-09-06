// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: the session opening up for check-in.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step2OpenArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* A door-like panel swinging open. */}
      <rect x="14" y="10" width="50" height="70" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M64 14c14 6 22 20 22 32" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.6" />
      <circle cx="52" cy="45" r="2.5" fill="currentColor" />

      {/* The new status pill — Open for check-in — with its confirming tick. */}
      <rect x="76" y="20" width="34" height="16" rx="8" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
      <path d="M84 28.5 88 32.5 96 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand" />
    </svg>
  )
}
