/**
 * Lightweight pulsing skeleton placeholders for the pages that fetch their
 * content on mount. Reuses `.pb-metric-card`/`.pb-court-card`'s own box
 * shape (border/radius/shadow, from pickleball.css) as the skeleton's
 * shape, so a loading grid pre-renders roughly the same footprint the real
 * card grid will occupy once data arrives -- no separate
 * skeleton-specific card CSS is introduced here, per the task's own
 * "reuse existing card dimensions" instruction.
 *
 * Purely decorative (`aria-hidden`, via `SkeletonBlock`) since a wall of
 * individually-announced placeholder shapes isn't useful to a screen
 * reader -- `SkeletonBlock` wraps a group of these plus one visually-hidden
 * `role="status"` label so assistive tech still gets a single, real loading
 * announcement per section instead of silence or noise.
 */

/**
 * @param {Object} props
 * @param {string} [props.className]
 * @param {'light'|'dark'} [props.tone] - 'light' (default) is the
 *   slate-200 tint used against this app's light `--surface-*` cards;
 *   'dark' is a translucent white tint for the one dark-card context
 *   (ScorekeeperPage's `.pb-scoreboard` skeleton) -- a variant flag rather
 *   than letting a caller-supplied `bg-*` class fight `bg-slate-200` for
 *   the win, since two same-specificity utility classes on one element
 *   resolve by generated-stylesheet order, not by class-attribute order.
 */
export function SkeletonLine({ className = '', tone = 'light' }) {
  const toneClassName = tone === 'dark' ? 'bg-white/10' : 'bg-slate-200'
  // motion-reduce:animate-none -- Task 10's reduced-motion audit found this
  // Tailwind animate-pulse had no prefers-reduced-motion guard (unlike every
  // other animated element this plan introduced); a static placeholder still
  // communicates "loading" via SkeletonBlock's own role="status" label.
  return <div className={`animate-pulse motion-reduce:animate-none rounded-md ${toneClassName} ${className}`} />
}

export function SkeletonMetricCard() {
  return (
    <div className="pb-metric-card space-y-3 p-5">
      <SkeletonLine className="h-3 w-1/3" />
      <SkeletonLine className="h-7 w-1/2" />
      <SkeletonLine className="h-3 w-2/3" />
    </div>
  )
}

export function SkeletonCourtCard() {
  return (
    <div className="pb-court-card space-y-3 p-4">
      <SkeletonLine className="h-4 w-2/3" />
      <SkeletonLine className="h-4 w-1/2" />
      <SkeletonLine className="h-16 w-full rounded-lg" />
    </div>
  )
}

/** @param {Object} props @param {number} [props.rows] @param {string} [props.rowClassName] */
export function SkeletonRows({ rows = 4, rowClassName = 'h-11 w-full rounded-lg' }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonLine key={index} className={rowClassName} />
      ))}
    </div>
  )
}

/**
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.label] - the real text announced to assistive tech
 *   (visually hidden) while the wrapped skeleton shapes stay `aria-hidden`.
 */
export function SkeletonBlock({ children, label = 'Loading…' }) {
  return (
    <div>
      <span className="sr-only" role="status">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}
