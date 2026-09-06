// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: sharing the live scoreboard — a phone, a TV, and the QR code
// linking them.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function ShareLiveArt({ className = '' }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={className} aria-hidden="true">
      {/* Phone, with its own mini score. */}
      <rect x="8" y="18" width="32" height="60" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="16" y="26" width="8" height="6" rx="1" fill="currentColor" />
      <rect x="26" y="26" width="8" height="6" rx="1" fill="currentColor" opacity="0.6" />

      {/* TV, wider, on a stand, also showing the score. */}
      <rect x="54" y="24" width="64" height="42" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M86 66v8M76 78h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="64" y="34" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="86" y="34" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />

      {/* QR code linking the two, a nine-cell grid. */}
      <rect x="124" y="80" width="32" height="32" rx="2" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
      <rect x="128" y="84" width="7" height="7" fill="currentColor" />
      <rect x="144" y="84" width="7" height="7" fill="currentColor" />
      <rect x="136" y="92" width="7" height="7" fill="currentColor" />
      <rect x="128" y="100" width="7" height="7" fill="currentColor" />
      <rect x="144" y="100" width="7" height="7" fill="currentColor" />
    </svg>
  )
}
