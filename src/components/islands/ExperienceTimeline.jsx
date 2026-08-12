import { useState } from 'react'
import AnimatedIcon from '../icons/AnimatedIcon'
import { ArrowRight, Briefcase } from '../icons/icons'
import ExperienceDetailModal from '../ExperienceDetailModal'

/**
 * @param {{
 *   experiences: Array<{ id?: string, title: string, role: string, company: string, dates: string, bullets: string[] }>,
 * }} props
 */
function ExperienceTimeline({ experiences }) {
  const [selectedExperience, setSelectedExperience] = useState(null)

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute left-[112px] sm:left-[242px] top-1 bottom-1 w-0.5 bg-gradient-to-b from-brand-teal to-brand-orange" aria-hidden="true"></div>
      <div className="space-y-10">
        {experiences.map((item, index) => (
          <div
            key={item.id || index}
            className="grid grid-cols-[90px_20px_1fr] sm:grid-cols-[220px_20px_1fr] items-center gap-3"
            data-reveal
            data-reveal-delay={index * 90}
          >
            <div className="flex flex-col items-end justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-orange px-2.5 py-2 text-right text-white shadow-[0_8px_18px_rgba(122,0,255,0.28)]">
              <span className="text-xs sm:text-sm font-bold leading-tight sm:leading-none whitespace-normal sm:whitespace-nowrap">{item.dates}</span>
            </div>
            <div className="flex justify-center">
              <div className="h-3.5 w-3.5 rounded-full border-[3px] border-white bg-brand-orange shadow-[0_0_0_3px_rgba(122,0,255,0.25)]"></div>
            </div>
            <section className="rounded-2xl bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-4 shadow-[0_10px_28px_rgba(60,28,120,0.12)]">
              <div className="mb-1.5 flex items-center gap-2">
                <AnimatedIcon icon={Briefcase} size={14} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
              </div>
              <h3 className="text-lg font-semibold text-brand-ink break-words">{item.role}</h3>
              <p className="text-sm text-slate-700">{item.company}</p>

              {item.bullets?.[0] ? (
                <p className="mt-2 line-clamp-1 text-sm text-slate-700">{item.bullets[0]}</p>
              ) : null}

              <button
                type="button"
                onClick={() => setSelectedExperience(item)}
                className="group mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal transition hover:text-brand-ink"
              >
                View details
                <AnimatedIcon icon={ArrowRight} size={14} color="inherit" animationType="hover-slide" ariaLabel="View full experience details" />
              </button>
            </section>
          </div>
        ))}
      </div>

      <ExperienceDetailModal
        experience={selectedExperience}
        isOpen={Boolean(selectedExperience)}
        onClose={() => setSelectedExperience(null)}
      />
    </div>
  )
}

export default ExperienceTimeline
