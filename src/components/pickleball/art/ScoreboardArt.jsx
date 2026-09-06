// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: rally scoring — two score panels and the serve indicator.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function ScoreboardArt({ className = '' }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={className} aria-hidden="true">
      {/* Two score panels. */}
      <rect x="10" y="14" width="62" height="64" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="88" y="14" width="62" height="64" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="24" y="28" width="34" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="102" y="28" width="34" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />

      {/* Serving indicator on the left panel. */}
      <circle cx="20" cy="22" r="4" fill="currentColor" className="text-brand" />

      {/* The 0-0-2 style server call, as three segments. */}
      <rect x="44" y="92" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
      <rect x="70" y="92" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <rect x="96" y="92" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <path d="M66 99h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M92 99h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
