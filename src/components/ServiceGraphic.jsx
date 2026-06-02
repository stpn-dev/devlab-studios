import { ArrowRight, CheckCircle2, Clock, Code2, Lightbulb, MessageSquare, TrendingUp, Wrench, Zap } from './icons/icons'

function ServiceGraphic({ service }) {
  const ServiceIcon = service.icon

  const renderServiceScene = () => {
    switch (service.variant) {
      case 'landing':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200/70 pb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                <div className="h-3 w-24 rounded-full bg-brand-teal/20" aria-hidden="true" />
                <div className="h-4 w-4/5 rounded-full bg-slate-800/85" aria-hidden="true" />
                <div className="h-3 w-full rounded-full bg-slate-200" aria-hidden="true" />
                <div className="h-3 w-5/6 rounded-full bg-slate-200" aria-hidden="true" />
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-teal px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_18px_rgba(48,28,114,0.16)]">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Primary CTA
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-brand-mint via-white to-brand-orange/10 p-4">
                <div className="space-y-3">
                  <div className="h-24 rounded-2xl bg-white shadow-sm" aria-hidden="true" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-10 rounded-xl bg-white shadow-sm" aria-hidden="true" />
                    <div className="h-10 rounded-xl bg-white shadow-sm" aria-hidden="true" />
                    <div className="h-10 rounded-xl bg-white shadow-sm" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'automation':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-center">
              {[
                { label: 'Trigger', icon: Clock },
                { label: 'AI Logic', icon: Lightbulb },
                { label: 'Action', icon: Zap },
              ].map((item, index) => {
                const ItemIcon = item.icon

                return (
                  <div key={item.label} className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#f6f2ff] p-4 text-center shadow-sm">
                    <div
                      className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal"
                      style={{ animation: `float ${4.8 + index * 0.45}s ease-in-out infinite` }}
                    >
                      <ItemIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-brand-ink">{item.label}</p>
                    {index < 2 ? (
                      <div className="absolute -right-2 top-1/2 hidden h-[2px] w-4 -translate-y-1/2 bg-brand-teal/40 sm:block" aria-hidden="true" />
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {service.tools.map((tool, index) => (
                <span
                  key={tool}
                  className="rounded-full border border-slate-200 bg-[#faf8ff] px-3 py-1.5 text-xs font-semibold text-slate-600"
                  style={{ animation: `pulse-soft ${3.2 + index * 0.35}s ease-in-out infinite` }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )

      case 'crm':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl bg-gradient-to-br from-[#f7f3ff] to-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Pipeline</div>
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">Leads</div>
                    <div className="mt-1 text-lg font-semibold text-brand-ink">128</div>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">Tasks</div>
                    <div className="mt-1 text-lg font-semibold text-brand-ink">24</div>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">Follow-ups</div>
                    <div className="mt-1 text-lg font-semibold text-brand-ink">9</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-white to-[#f7f3ff] p-4 ring-1 ring-slate-200">
                  <div className="flex h-24 items-end gap-2">
                    <div className="w-full rounded-t-xl bg-brand-teal/30" style={{ height: '35%' }} aria-hidden="true" />
                    <div className="w-full rounded-t-xl bg-brand-teal/45" style={{ height: '58%' }} aria-hidden="true" />
                    <div className="w-full rounded-t-xl bg-brand-teal/60" style={{ height: '78%' }} aria-hidden="true" />
                    <div className="w-full rounded-t-xl bg-brand-teal/75" style={{ height: '92%' }} aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'tools':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[0.34fr_0.66fr]">
              <div className="rounded-2xl bg-gradient-to-b from-[#f7f3ff] to-white p-4 shadow-sm">
                <div className="space-y-3">
                  <div className="h-9 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-9 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-9 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-ink">Workflow Panel</p>
                      <p className="text-xs text-slate-500">Task-ready internal interface</p>
                    </div>
                    <Wrench className="h-5 w-5 text-brand-teal" aria-hidden="true" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-teal">Queue</div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-2 w-3/4 rounded-full bg-brand-teal/65" />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-teal">Status</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-brand-ink">
                      <CheckCircle2 className="h-4 w-4 text-brand-teal" aria-hidden="true" />
                      Ready
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'backend':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-center">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">Client</div>
                <div className="mt-2 space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-slate-200" aria-hidden="true" />
                  <div className="h-3 w-2/3 rounded-full bg-slate-200" aria-hidden="true" />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-brand-teal">
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
                <Code2 className="h-6 w-6" aria-hidden="true" />
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#f7f3ff] to-white p-4 ring-1 ring-slate-200">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">Service Layer</div>
                <div className="mt-2 space-y-2">
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-[#f6f2ff] px-3 py-1.5">GET /api/leads</span>
                <span className="rounded-full bg-[#f6f2ff] px-3 py-1.5">POST /api/tasks</span>
                <span className="rounded-full bg-[#f6f2ff] px-3 py-1.5">200 OK</span>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] bg-white/88 p-4 shadow-[0_16px_34px_rgba(48,28,114,0.10)] sm:p-5">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-brand-mint/55 via-white to-transparent" aria-hidden="true" />
      <div className="absolute right-5 top-5 h-16 w-16 rounded-full bg-brand-orange/10 blur-2xl" aria-hidden="true" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="inline-flex max-w-[90%] items-center gap-2 rounded-full border border-brand-teal/15 bg-white/95 px-3 py-2 text-[0.7rem] font-semibold text-brand-teal shadow-[0_8px_18px_rgba(48,28,114,0.08)] sm:max-w-[85%] sm:text-xs">
          <ServiceIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{service.imageLabel}</span>
        </div>
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal"
          style={{ animation: 'float 5.8s ease-in-out infinite' }}
          aria-hidden="true"
        >
          <ServiceIcon className="h-5 w-5" />
        </div>
      </div>

      <div className="relative z-10 mt-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-[#f7fbff] via-white to-[#f4efff] px-4 pb-4 pt-4">
        <div className="absolute left-4 right-4 top-4 flex flex-wrap gap-2">
          {service.tools.map((tool, index) => (
            <span
              key={tool}
              className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 shadow-sm sm:text-[0.72rem]"
              style={{ animation: `pulse-soft ${3.6 + index * 0.4}s ease-in-out infinite` }}
            >
              {tool}
            </span>
          ))}
        </div>

        <div className="mt-12" style={{ animation: 'fadeInScale 0.7s ease-out' }}>
          {renderServiceScene()}
        </div>

        <div className="mt-4 rounded-2xl bg-white/88 px-3 py-3 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-teal">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Visual Focus
          </div>
          <p className="mt-2 text-sm text-slate-600">{service.visualNote}</p>
        </div>
      </div>
    </div>
  )
}

export default ServiceGraphic
