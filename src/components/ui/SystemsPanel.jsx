import AnimatedIcon from '../icons/AnimatedIcon'
import * as Icons from '../icons/icons'
import * as Data from '../../data/workflows'

function resolveIcon(name) {
  return Icons[name] || Icons.Lightbulb
}

function SystemsPanel({
  workflowPatterns: providedPatterns,
  systemCharacteristics: providedCharacteristics,
}) {
  const staticPatterns = Data.workflowPatterns || (Data.default ? Data.default.workflowPatterns : [])
  const staticCharacteristics = Data.systemCharacteristics || (Data.default ? Data.default.systemCharacteristics : [])

  const patterns = Array.isArray(providedPatterns) && providedPatterns.length ? providedPatterns : staticPatterns
  const characteristics =
    Array.isArray(providedCharacteristics) && providedCharacteristics.length
      ? providedCharacteristics
      : staticCharacteristics

  const featuredPatterns = patterns.slice(0, 4)
  const morePatternsCount = Math.max(patterns.length - featuredPatterns.length, 0)
  const featuredCharacteristics = characteristics.slice(0, 4)
  const moreCharacteristicsCount = Math.max(characteristics.length - featuredCharacteristics.length, 0)

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-[0_16px_36px_rgba(11,24,50,0.08)] sm:p-6">
      <div className="mb-5 flex items-center justify-between text-sm text-slate-700">
        <p className="font-semibold tracking-wide">Systems & Workflows</p>
        <span className="rounded-full border border-brand-teal/20 bg-brand-mint px-3 py-1 text-xs text-brand-teal">Capabilities</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
        <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-brand-teal">Workflow Patterns</p>
          <div className="space-y-2">
            {featuredPatterns.map((item) => {
              const Icon = resolveIcon(item.icon)
              return (
                <div key={item.key} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <AnimatedIcon icon={Icon} size={16} color="text-brand-ink" animationType="none" ariaLabel={item.label} />
                  <span className="text-[13px] leading-snug text-slate-700">{item.label}</span>
                </div>
              )
            })}
          </div>
          {morePatternsCount > 0 && (
            <p className="mt-3 text-xs text-slate-500">+{morePatternsCount} additional workflow pattern(s)</p>
          )}
        </section>

        <section className="xl:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-brand-teal">System Characteristics</p>
          <div className="flex flex-wrap gap-2">
            {featuredCharacteristics.map((item) => {
              const Icon = resolveIcon(item.icon)
              return (
                <div key={item.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2">
                  <AnimatedIcon icon={Icon} size={15} color="text-brand-ink" animationType="none" ariaLabel={item.label} />
                  <span className="text-xs text-slate-700">{item.label}</span>
                </div>
              )
            })}
          </div>
          {moreCharacteristicsCount > 0 && (
            <p className="mt-3 text-xs text-slate-500">+{moreCharacteristicsCount} additional characteristic(s)</p>
          )}
        </section>
      </div>

      {/* Soft background accents */}
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-brand-teal/15 blur-[70px]" aria-hidden />
      <div className="absolute -left-8 bottom-8 h-24 w-24 rounded-full bg-brand-orange/15 blur-[70px]" aria-hidden />
    </div>
  )
}

export default SystemsPanel
