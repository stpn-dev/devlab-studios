import { useEffect } from 'react'
import AnimatedIcon from './icons/AnimatedIcon'
import { ArrowRight, Briefcase } from './icons/icons'

/**
 * @param {{
 *   experience: { title: string, role: string, company: string, dates: string, bullets: string[] } | null,
 *   isOpen: boolean,
 *   onClose: () => void,
 * }} props
 */
function ExperienceDetailModal({ experience, isOpen, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen || !experience) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="experience-detail-title"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(60,28,120,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
              <p className="text-sm uppercase tracking-[0.14em] text-slate-500">{experience.title}</p>
            </div>
            <h3 id="experience-detail-title" className="mt-1 text-2xl font-semibold text-brand-ink">{experience.role}</h3>
            <p className="text-slate-700">{experience.company}</p>
            <p className="mt-1 text-sm text-slate-500">{experience.dates}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 hover:text-brand-ink"
            aria-label="Close experience details"
          >
            ✕
          </button>
        </div>

        <ul className="mt-6 space-y-3 text-slate-700">
          {experience.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-3 leading-relaxed">
              <AnimatedIcon icon={ArrowRight} size={16} color="text-brand-teal" animationType="none" className="mt-0.5 flex-shrink-0" />
              <span className="break-words">{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default ExperienceDetailModal
