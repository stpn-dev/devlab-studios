/**
 * A single dashboard/session metric tile: an optional leading icon next to
 * an `.pb-eyebrow` label, a large `.pb-score` value, and two optional
 * extras -- a comparison `subValue` ("20 / 24") and a status chip. Shared by
 * DashboardPage's hero and meant for reuse by later tasks (Task 3's court
 * overview count), so this component stays free of any page-specific data
 * shape: callers pass already-computed primitives, never raw session/player
 * records.
 *
 * `icon` must be a component imported from `src/components/icons/icons.js`'s
 * barrel -- this file never imports `lucide-react` directly.
 *
 * @param {Object} props
 * @param {import('react').ComponentType<{className?: string, strokeWidth?: number}>} [props.icon]
 * @param {string} props.label
 * @param {string|number|import('react').ReactNode} props.value
 * @param {string} [props.subValue]
 * @param {string} [props.status]
 * @param {string} [props.valueTestId] - optional `data-testid` placed on the
 *   element holding `value`, for callers that need a stable selector on this
 *   card's primary number/text (e.g. SessionControlPage.jsx's queue/court counts).
 */
export default function MetricCard({ icon: Icon, label, value, subValue, status, valueTestId }) {
  return (
    <div className="pb-metric-card p-5">
      <div className="pb-rule absolute inset-x-0 top-0 h-1 w-full rounded-none" aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <p className="pb-eyebrow flex items-center gap-1.5">
          {Icon ? <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} aria-hidden="true" /> : null}
          <span>{label}</span>
        </p>
        {status ? (
          // text-slate-600, not -500: -500 measures ~4.34:1 against this
          // bg-slate-100 chip -- short of WCAG AA's 4.5:1 for normal-size
          // text. -600 measures ~7.0:1 against the same background.
          <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{status}</span>
        ) : null}
      </div>
      <p className="pb-score mt-2 text-3xl text-slate-900" data-testid={valueTestId || undefined}>
        {value}
      </p>
      {subValue ? <p className="mt-1 text-xs font-medium text-slate-500">{subValue}</p> : null}
    </div>
  )
}
