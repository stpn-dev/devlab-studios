import { humanize } from './format'

/**
 * Shared presentational components for the Lead CRM screens.
 *
 * COMPONENTS ONLY. Constants, formatters and the data hook live in format.js
 * and useResource.js — a module exporting both components and plain values
 * defeats React Fast Refresh, which the project's lint config enforces.
 *
 * Built from the same Tailwind idioms as the existing Inquiries screen, so the
 * CRM reads as another section of this CMS rather than a bolted-on app.
 */

export function Badge({ value, tones = {}, label }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[value] || 'bg-slate-100 text-slate-600'}`}
    >
      {label ?? humanize(value)}
    </span>
  )
}

export function Panel({ title, description, actions, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Field({ label, children }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words text-slate-800">{children}</dd>
    </div>
  )
}

export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function Feedback({ feedback }) {
  if (!feedback) return null

  const tone =
    feedback.tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : feedback.tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-rose-200 bg-rose-50 text-rose-800'

  return <div className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>{feedback.message}</div>
}

/**
 * The banner every Lead CRM screen shows when the engine is switched off.
 *
 * Explicit rather than silent. With the flags at their shipped defaults the
 * screens are reachable and empty, and without this an operator would
 * reasonably conclude the feature is broken rather than disabled.
 */
export function DisabledNotice({ flags }) {
  if (!flags || flags.engine) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">The Lead Intelligence Engine is switched off.</p>
      <p className="mt-1 text-xs text-amber-800">
        Nothing is being discovered, crawled, analysed or synchronized. Turn on the engine and the capabilities you
        need in{' '}
        <a className="font-semibold underline" href="/admin/lead-crm/settings">
          CRM Settings
        </a>
        . Deployment-locked switches require their Worker var to permit them. Existing data stays readable.
      </p>
    </div>
  )
}
