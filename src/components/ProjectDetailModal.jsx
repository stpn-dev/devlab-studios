import { useEffect, useMemo, useState } from 'react'
import PrimaryButton from './PrimaryButton'
import AnimatedIcon from './icons/AnimatedIcon'
import ResponsivePicture from './ResponsivePicture'
import { ExternalLink, Code2, ChevronLeft, ChevronRight } from './icons/icons'

/**
 * @param {{
 *   project: import('../lib/content/projects').ProjectData | null,
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onImageClick: (image: { optimized: unknown, altText?: string }) => void,
 *   suppressEscape?: boolean,
 * }} props
 */
function ProjectDetailModal({ project, isOpen, onClose, onImageClick, suppressEscape = false }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const isInternalLiveLink = project?.liveUrl?.startsWith('/')

  const galleryImages = useMemo(() => {
    if (!project) return []
    const items = Array.isArray(project.galleryImages) ? project.galleryImages.filter((item) => item?.url) : []
    if (items.length > 0) return items
    if (project.image) {
      return [{ id: `${project.id}-cover`, url: project.image, optimized: project.optimizedImage, altText: `${project.title} cover`, sortOrder: 1 }]
    }
    return []
  }, [project])

  const activeImage = galleryImages[activeIndex] || galleryImages[0] || null

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? galleryImages.length - 1 : current - 1))
  }

  function showNext() {
    setActiveIndex((current) => (current === galleryImages.length - 1 ? 0 : current + 1))
  }

  function handleClose() {
    setActiveIndex(0)
    onClose()
  }

  // Handle ESC key to close. Suppressed while a nested ImageModal is open on
  // top of this one, so a single Escape press closes only the topmost modal
  // instead of both at once.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !suppressEscape) {
        handleClose()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, suppressEscape])

  if (!isOpen || !project) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-detail-title"
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 id="project-detail-title" className="text-2xl font-semibold text-white">{project.title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close project details"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/30">
              {activeImage ? (
                <button type="button" onClick={() => onImageClick(activeImage)} className="block w-full">
                  <ResponsivePicture
                    image={activeImage.optimized}
                    alt={activeImage.altText || `${project.title} gallery image ${activeIndex + 1}`}
                    className="h-[260px] w-full object-cover sm:h-[360px]"
                  />
                </button>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-slate-300 sm:h-[360px]">
                  No gallery images available.
                </div>
              )}
            </div>

            {galleryImages.length > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={showPrevious} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <button type="button" onClick={showNext} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
                <p className="text-sm text-slate-300">Slide {activeIndex + 1} of {galleryImages.length}</p>
              </div>
            ) : null}

            {galleryImages.length > 1 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {galleryImages.map((image, index) => (
                  <button
                    key={image.id || image.url}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`overflow-hidden rounded-lg border transition ${index === activeIndex ? 'border-brand-teal ring-2 ring-brand-teal/50' : 'border-white/10 hover:border-white/25'}`}
                  >
                    <ResponsivePicture image={image.optimized} alt={image.altText || `${project.title} thumbnail ${index + 1}`} className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm leading-relaxed text-slate-200/80">{project.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.techStack?.map((tech) => (
                <span key={tech} className="badge-pill">{tech}</span>
              )) ?? null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {project.liveUrl && project.liveUrl !== '#' ? (
                <PrimaryButton {...(isInternalLiveLink ? { to: project.liveUrl } : { href: project.liveUrl })} variant="primary" className="px-4 py-2">
                  <span>Live Demo</span>
                  <AnimatedIcon icon={ExternalLink} size={16} color="inherit" animationType="hover-slide" ariaLabel="Open live demo" />
                </PrimaryButton>
              ) : null}
              {project.sourceUrl && project.sourceUrl !== '#' ? (
                <PrimaryButton href={project.sourceUrl} variant="secondary" className="px-4 py-2">
                  <span>Source Code</span>
                  <AnimatedIcon icon={Code2} size={16} color="inherit" animationType="hover-slide" ariaLabel="View source code" />
                </PrimaryButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectDetailModal
