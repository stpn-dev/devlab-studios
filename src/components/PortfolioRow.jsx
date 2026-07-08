import { useMemo, useState } from 'react'
import PrimaryButton from './PrimaryButton'
import GlassCard from './GlassCard'
import AnimatedIcon from './icons/AnimatedIcon'
import { ExternalLink, Code2, Zap, Maximize2, ChevronLeft, ChevronRight, Image as ImageIcon } from './icons/icons'

function PortfolioRow({ project, onImageClick }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0)
  const isInternalLiveLink = project.liveUrl?.startsWith('/')
  const galleryImages = useMemo(() => {
    const items = Array.isArray(project.galleryImages) ? project.galleryImages.filter((item) => item?.url) : []
    if (items.length > 0) return items
    if (project.image) {
      return [
        {
          id: `${project.id}-cover`,
          url: project.image,
          altText: `${project.title} cover`,
          sortOrder: 1,
        },
      ]
    }
    return []
  }, [project.galleryImages, project.id, project.image, project.title])

  const activeGalleryImage = galleryImages[activeGalleryIndex] || galleryImages[0] || null

  function toggleExpanded() {
    setIsExpanded((current) => !current)
  }

  function showPreviousImage() {
    setActiveGalleryIndex((current) => (current === 0 ? galleryImages.length - 1 : current - 1))
  }

  function showNextImage() {
    setActiveGalleryIndex((current) => (current === galleryImages.length - 1 ? 0 : current + 1))
  }

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1.6fr] lg:items-center">
        {/* Clickable Image Container */}
        <div
          className="group relative overflow-hidden rounded-xl border border-white/15 bg-white/5 shadow-faint cursor-pointer transition-all hover:border-white/30"
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          aria-label={`Expand ${project.title} project details`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpanded()
            }
          }}
        >
          <img
            src={project.image}
            alt={`${project.title} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          {/* Hover Overlay with Icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/40">
            <AnimatedIcon
              icon={Maximize2}
              size={32}
              color="text-white opacity-0 group-hover:opacity-100"
              animationType="none"
              ariaLabel="Expand project"
              className="transition-opacity duration-300"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <AnimatedIcon
                icon={Zap}
                size={16}
                color="text-navy-300"
                animationType="none"
                ariaLabel="Featured project"
              />
              <p className="text-sm uppercase tracking-[0.14em] text-navy-100/70">Featured project</p>
            </div>
            <h3 className="text-2xl font-semibold text-white">{project.title}</h3>
            <p className="mt-2 text-slate-200/80">{project.description}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {project.techStack.map((tech) => (
              <span key={tech} className="badge-pill">
                {tech}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <PrimaryButton
              variant="secondary"
              className="px-4 py-2"
              onClick={toggleExpanded}
            >
              <span>{isExpanded ? 'Hide Gallery' : 'View Gallery'}</span>
              <AnimatedIcon
                icon={ImageIcon}
                size={16}
                color="inherit"
                animationType="hover-slide"
                ariaLabel="Toggle project gallery"
              />
            </PrimaryButton>

            {project.liveUrl && project.liveUrl !== '#' ? (
              <PrimaryButton
                {...(isInternalLiveLink ? { to: project.liveUrl } : { href: project.liveUrl })}
                variant="primary"
                className="px-4 py-2"
              >
                <span>Live Demo</span>
                <AnimatedIcon
                  icon={ExternalLink}
                  size={16}
                  color="inherit"
                  animationType="hover-slide"
                  ariaLabel="Open live demo"
                />
              </PrimaryButton>
            ) : null}

            {project.sourceUrl && project.sourceUrl !== '#' ? (
              <PrimaryButton href={project.sourceUrl} variant="secondary" className="px-4 py-2">
                <span>Source Code</span>
                <AnimatedIcon
                  icon={Code2}
                  size={16}
                  color="inherit"
                  animationType="hover-slide"
                  ariaLabel="View source code"
                />
              </PrimaryButton>
            ) : null}
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-6 border-t border-white/10 pt-6">
          <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/30">
                {activeGalleryImage ? (
                  <button
                    type="button"
                    onClick={() => onImageClick(activeGalleryImage)}
                    className="block w-full"
                  >
                    <img
                      src={activeGalleryImage.url}
                      alt={activeGalleryImage.altText || `${project.title} gallery image ${activeGalleryIndex + 1}`}
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
                    <button
                      type="button"
                      onClick={showPreviousImage}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                      <ChevronLeft size={16} />
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={showNextImage}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <p className="text-sm text-slate-300">
                    Slide {activeGalleryIndex + 1} of {galleryImages.length}
                  </p>
                </div>
              ) : null}

              {galleryImages.length > 1 ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {galleryImages.map((image, index) => (
                    <button
                      key={image.id || image.url}
                      type="button"
                      onClick={() => setActiveGalleryIndex(index)}
                      className={`overflow-hidden rounded-lg border transition ${
                        index === activeGalleryIndex
                          ? 'border-brand-teal ring-2 ring-brand-teal/50'
                          : 'border-white/10 hover:border-white/25'
                      }`}
                    >
                      <img
                        src={image.url}
                        alt={image.altText || `${project.title} thumbnail ${index + 1}`}
                        className="h-20 w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-100/70">Project Detail</p>
              <h4 className="mt-2 text-lg font-semibold text-white">{project.title}</h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-200/80">
                {project.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {project.techStack.map((tech) => (
                  <span key={tech} className="badge-pill">
                    {tech}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-xs text-slate-300/70">
                Click the large image to open it full size.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </GlassCard>
  )
}

export default PortfolioRow
