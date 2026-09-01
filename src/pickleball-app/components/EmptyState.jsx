import { Link } from 'react-router-dom'

/**
 * A reusable "nothing here yet" placeholder for Pickleball's own list/detail
 * pages -- title + description, an optional decorative illustration slot
 * (one of `components/illustrations/*.jsx`), and an optional CTA button
 * reusing `.pb-btn-primary`. Pickleball-scoped, and distinct from the
 * marketing-site's own `src/components/ui/EmptyState.jsx` (dark
 * glassmorphism, untouched) -- this one composes only the same
 * `--surface-*`/`--border-*`/`--text-*` tokens `.pb-metric-card` already
 * uses, so it reads as part of the same card language as the content it
 * stands in for.
 *
 * `compact` shrinks padding/type scale and always omits the illustration --
 * for the many secondary "this one sub-list happens to be empty right now"
 * spots (an org's operator list, a session's assigned-court list, a
 * filtered search with no matches, ...) where a full illustrated block
 * would be visually heavier than the one-line text it replaces. Non-compact
 * is for the small set of "this entire page's content is empty" states
 * (Sessions/Queue/Courts/Dashboard hero), where an illustration earns its
 * space.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {import('react').ComponentType<{className?: string}>} [props.illustration]
 *   - one of the `components/illustrations/*.jsx` components; ignored when
 *   `compact` is true.
 * @param {{ label: string, onClick?: () => void, to?: string }} [props.action]
 *   - renders a `.pb-btn-primary` button (`onClick`) or link (`to`),
 *   whichever the caller supplies.
 * @param {boolean} [props.compact]
 */
export default function EmptyState({ title, description, illustration: Illustration, action, compact = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center ${
        compact ? 'gap-1 p-4' : 'gap-3 p-10'
      }`}
    >
      {!compact && Illustration ? <Illustration className="h-20 w-20 text-slate-300" /> : null}
      <p className={compact ? 'text-sm font-medium text-slate-500' : 'text-base font-semibold text-slate-700'}>{title}</p>
      {description ? <p className="max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? (
        action.to ? (
          <Link to={action.to} className="pb-btn-primary mt-1 inline-flex items-center rounded-lg px-4 py-2 text-sm">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="pb-btn-primary mt-1 inline-flex items-center rounded-lg px-4 py-2 text-sm">
            {action.label}
          </button>
        )
      ) : null}
    </div>
  )
}
