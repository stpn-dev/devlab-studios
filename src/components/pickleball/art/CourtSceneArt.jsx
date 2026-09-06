// Original, hand-authored SVG — not copied from any reference image and not
// derived from any third-party vector asset, matching the rule set by
// src/pickleball-app/components/illustrations/PickleballHeroGraphic.jsx.
//
// Drawn in `currentColor` with one optional accent, so the same component
// reads correctly on the dark public shell AND inside a `light-artifact`
// panel with no variant. Purely decorative: aria-hidden, no embedded text.
//
// THIS FILE IS THE TEMPLATE for every component in this directory. Copy its
// shape: one default export, `{ className }`, one <svg viewBox>, aria-hidden.

/**
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function CourtSceneArt({ className = '' }) {
  return (
    <svg viewBox="0 0 320 200" fill="none" className={className} aria-hidden="true">
      {/* Two courts in perspective: outer bounds, net, kitchen line. */}
      <path d="M18 150 60 54h116l-14 96Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M30 118h124M46 82h104" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M160 150 174 54h116l42 96Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.45" />

      {/* Four players on the near court. */}
      <circle cx="64" cy="132" r="6" fill="currentColor" />
      <circle cx="126" cy="132" r="6" fill="currentColor" />
      <circle cx="78" cy="70" r="5" fill="currentColor" opacity="0.6" />
      <circle cx="140" cy="70" r="5" fill="currentColor" opacity="0.6" />

      {/* Ball in flight, with the perforations that make it read as a pickleball. */}
      <circle cx="196" cy="40" r="12" stroke="currentColor" strokeWidth="2" className="text-brand" />
      <circle cx="196" cy="33" r="1.4" fill="currentColor" />
      <circle cx="190" cy="40" r="1.4" fill="currentColor" />
      <circle cx="202" cy="40" r="1.4" fill="currentColor" />

      {/* Waiting strip — the queue, the thing this product is actually about. */}
      <rect x="18" y="168" width="284" height="20" rx="10" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <circle cx="38" cy="178" r="5" fill="currentColor" />
      <circle cx="56" cy="178" r="5" fill="currentColor" opacity="0.75" />
      <circle cx="74" cy="178" r="5" fill="currentColor" opacity="0.5" />
      <circle cx="92" cy="178" r="5" fill="currentColor" opacity="0.3" />
    </svg>
  )
}
