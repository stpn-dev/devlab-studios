// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: live standings — five ranked rows, closest to first place on top.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function StandingsArt({ className = '' }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={className} aria-hidden="true">
      {/* Rank 1 — accented, full length value bar. */}
      <circle cx="14" cy="14" r="6" fill="currentColor" className="text-brand" />
      <rect x="26" y="8" width="40" height="12" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="74" y="8" width="78" height="12" rx="6" fill="currentColor" />

      {/* Rank 2. */}
      <circle cx="14" cy="36" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <rect x="26" y="30" width="40" height="12" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <rect x="74" y="30" width="64" height="12" rx="6" fill="currentColor" opacity="0.6" />

      {/* Rank 3. */}
      <circle cx="14" cy="58" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <rect x="26" y="52" width="40" height="12" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <rect x="74" y="52" width="50" height="12" rx="6" fill="currentColor" opacity="0.45" />

      {/* Rank 4. */}
      <circle cx="14" cy="80" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <rect x="26" y="74" width="40" height="12" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <rect x="74" y="74" width="36" height="12" rx="6" fill="currentColor" opacity="0.35" />

      {/* Rank 5. */}
      <circle cx="14" cy="102" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <rect x="26" y="96" width="40" height="12" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <rect x="74" y="96" width="22" height="12" rx="6" fill="currentColor" opacity="0.25" />
    </svg>
  )
}
