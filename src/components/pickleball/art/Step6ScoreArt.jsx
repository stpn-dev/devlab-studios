// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: the two rally buttons that drive scoring.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step6ScoreArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* Two score panels, one currently serving. */}
      <rect x="10" y="8" width="46" height="34" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="64" y="8" width="46" height="34" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <circle cx="50" cy="14" r="3" className="text-brand" fill="currentColor" />

      {/* Two large rally buttons beneath — the only scoring input. */}
      <rect x="10" y="52" width="46" height="28" rx="8" stroke="currentColor" strokeWidth="2" />
      <rect x="64" y="52" width="46" height="28" rx="8" stroke="currentColor" strokeWidth="2" />
      <path d="M28 70v-8m-5 5 5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M82 70v-8m-5 5 5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  )
}
