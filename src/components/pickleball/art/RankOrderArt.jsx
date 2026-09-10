// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: how the board is ordered. Ranked rows sit above a dashed line
// with value bars in descending length; two of them are drawn exactly equal
// to show where a tie-break is needed. Below the line, unranked players are
// hollow and ordered by how close they are to qualifying — which is why
// their bars grow shorter downward while their rank markers stay empty.
//
// Deliberately a sibling of StandingsArt rather than a replacement: that one
// illustrates a board, this one illustrates the *rule* that produced it.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function RankOrderArt({ className = '' }) {
  return (
    <svg viewBox="0 0 320 160" fill="none" className={className} aria-hidden="true">
      {/* Rank 1. */}
      <circle cx="14" cy="14" r="7" fill="currentColor" className="text-brand" />
      <rect x="32" y="7" width="196" height="14" rx="7" fill="currentColor" className="text-brand" opacity="0.9" />

      {/* Ranks 2 and 3 — identical lengths: an exact OPI tie. */}
      <circle cx="14" cy="40" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
      <rect x="32" y="33" width="150" height="14" rx="7" fill="currentColor" opacity="0.6" />
      <circle cx="14" cy="62" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
      <rect x="32" y="55" width="150" height="14" rx="7" fill="currentColor" opacity="0.6" />

      {/* The tie-break bracket: same value, so name order decides. */}
      <path d="M192 33v36" stroke="currentColor" strokeWidth="1.5" className="text-brand" opacity="0.7" strokeLinecap="round" />
      <path d="M192 40h10M192 62h10" stroke="currentColor" strokeWidth="1.5" className="text-brand" opacity="0.7" strokeLinecap="round" />
      <path d="M208 36l6 6 6-6" stroke="currentColor" strokeWidth="1.5" className="text-brand" opacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M208 66l6-6 6 6" stroke="currentColor" strokeWidth="1.5" className="text-brand" opacity="0.55" strokeLinecap="round" strokeLinejoin="round" />

      {/* Rank 4. */}
      <circle cx="14" cy="84" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="32" y="77" width="112" height="14" rx="7" fill="currentColor" opacity="0.45" />

      {/* The qualification line. */}
      <path d="M6 104h308" stroke="currentColor" strokeWidth="1.5" opacity="0.35" strokeDasharray="6 5" />

      {/* Below it: present, unranked, ordered by games played. */}
      <circle cx="14" cy="122" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.3" strokeDasharray="3 3" />
      <rect x="32" y="115" width="84" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <circle cx="14" cy="146" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.22" strokeDasharray="3 3" />
      <rect x="32" y="139" width="46" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" opacity="0.22" />
    </svg>
  )
}
