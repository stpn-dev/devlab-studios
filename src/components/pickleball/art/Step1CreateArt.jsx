// Original, hand-authored SVG — see CourtSceneArt.jsx for the shared rules
// this file follows (currentColor, aria-hidden, no third-party asset).
// Subject: filling out a new session's form, next to the court it creates.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function Step1CreateArt({ className = '' }) {
  return (
    <svg viewBox="0 0 120 90" fill="none" className={className} aria-hidden="true">
      {/* The session form: a card with three fields (venue, name, ruleset). */}
      <rect x="10" y="10" width="64" height="70" rx="6" stroke="currentColor" strokeWidth="2" />
      <rect x="20" y="24" width="44" height="6" rx="3" fill="currentColor" opacity="0.8" />
      <rect x="20" y="40" width="44" height="6" rx="3" fill="currentColor" opacity="0.55" />
      <rect x="20" y="56" width="28" height="6" rx="3" fill="currentColor" opacity="0.55" />

      {/* The court every one of that venue's courts is added to automatically. */}
      <rect x="84" y="18" width="26" height="44" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <path d="M84 40h26" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />

      {/* Confirmation dot — the one accent, marking the form as ready. */}
      <circle cx="97" cy="70" r="4" className="text-brand" fill="currentColor" />
    </svg>
  )
}
