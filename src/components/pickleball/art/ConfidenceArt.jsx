// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: why more games make the same number more trustworthy. A scatter
// of per-game results settles toward the mean line as it moves right, and
// the uncertainty band around it narrows. The band is the whole idea, so it
// gets the accent; the mean line stays neutral.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function ConfidenceArt({ className = '' }) {
  return (
    <svg viewBox="0 0 320 140" fill="none" className={className} aria-hidden="true">
      {/* Narrowing uncertainty band. */}
      <path
        d="M18 20c96 22 168 40 284 50 -116 10 -188 28 -284 50 0-33 0-67 0-100Z"
        fill="currentColor"
        className="text-brand"
        opacity="0.12"
      />

      {/* The mean the band closes onto. */}
      <path d="M18 70h284" stroke="currentColor" strokeWidth="1.5" opacity="0.4" strokeDasharray="4 4" />

      {/* Per-game results: wide apart early, tight later. */}
      <circle cx="34" cy="30" r="5" fill="currentColor" opacity="0.5" />
      <circle cx="34" cy="110" r="5" fill="currentColor" opacity="0.5" />
      <circle cx="78" cy="44" r="5" fill="currentColor" opacity="0.55" />
      <circle cx="78" cy="96" r="5" fill="currentColor" opacity="0.55" />
      <circle cx="126" cy="54" r="5" fill="currentColor" opacity="0.6" />
      <circle cx="126" cy="88" r="5" fill="currentColor" opacity="0.6" />
      <circle cx="176" cy="60" r="5" fill="currentColor" opacity="0.7" />
      <circle cx="176" cy="80" r="5" fill="currentColor" opacity="0.7" />
      <circle cx="224" cy="65" r="5" fill="currentColor" className="text-brand" opacity="0.8" />
      <circle cx="224" cy="76" r="5" fill="currentColor" className="text-brand" opacity="0.8" />
      <circle cx="272" cy="68" r="5" fill="currentColor" className="text-brand" />
      <circle cx="272" cy="73" r="5" fill="currentColor" className="text-brand" />

      {/* Three tier gates along the run of games. */}
      <path d="M100 14v112" stroke="currentColor" strokeWidth="1" opacity="0.22" />
      <path d="M200 14v112" stroke="currentColor" strokeWidth="1" opacity="0.22" />

      {/* Axis: games played, left to right. */}
      <path d="M18 130h284" stroke="currentColor" strokeWidth="1.5" opacity="0.25" strokeLinecap="round" />
      <path d="M296 126l6 4-6 4" stroke="currentColor" strokeWidth="1.5" opacity="0.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
