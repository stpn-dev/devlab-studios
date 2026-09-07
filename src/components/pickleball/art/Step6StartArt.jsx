// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: the first serve of a game — the seated foursome with one player
// marked out as the chosen starting server.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step6StartArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* The assigned court, seats already filled. */}
      <rect x="8" y="10" width="104" height="70" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M8 45h104" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />

      {/* The chosen starting server, picked out from the other three. */}
      <circle cx="30" cy="64" r="6" fill="currentColor" />
      <ellipse cx="45" cy="60" rx="5" ry="7" stroke="currentColor" strokeWidth="2" className="text-brand" />
      <path d="M45 67v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-brand" />

      {/* The other three seats. */}
      <circle cx="88" cy="64" r="5" fill="currentColor" opacity="0.45" />
      <circle cx="30" cy="26" r="5" fill="currentColor" opacity="0.45" />
      <circle cx="88" cy="26" r="5" fill="currentColor" opacity="0.45" />

      {/* The serve leaving on its way over the net. */}
      <path d="M53 54c12-12 24-16 36-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 5" opacity="0.8" />
      <circle cx="92" cy="38" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
