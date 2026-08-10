import { useCallback, useEffect, useRef, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import PortfolioCard from '../PortfolioCard'
import ProjectDetailModal from '../ProjectDetailModal'
import ImageModal from '../ImageModal'

const CATEGORIES = [
  { label: 'Automation Buildouts', value: 'Automation' },
  { label: 'Website Buildouts', value: 'Website' },
]

function PortfolioGallery({ projects }) {
  const [category, setCategory] = useState('Automation')
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const autoplayRef = useRef(
    Autoplay({ delay: 3000, stopOnMouseEnter: true, stopOnInteraction: false }),
  )

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center' },
    prefersReducedMotion ? [] : [autoplayRef.current],
  )

  const filteredItems = projects.filter((item) =>
    category === 'Website' ? item.type === 'Website' : item.type === 'Automation',
  )

  const applyCenterFocus = useCallback(() => {
    if (!emblaApi) return
    const rootRect = emblaApi.rootNode().getBoundingClientRect()
    const centerX = rootRect.left + rootRect.width / 2

    emblaApi.slideNodes().forEach((slideNode) => {
      const slideRect = slideNode.getBoundingClientRect()
      const slideCenter = slideRect.left + slideRect.width / 2
      const distance = Math.abs(slideCenter - centerX)
      const normalized = Math.min(distance / (rootRect.width / 2), 1)
      // Never write `transform` on slideNode itself: Embla's `loop: true` mode
      // writes `translate3d(...)` directly onto each slide node's own
      // style.transform to reposition wrap-around slides at the loop seam.
      // Overwriting it here would clobber that positioning. `opacity` and
      // `filter` are untouched by Embla, so they stay on the slide node; the
      // scale effect moves to the inner child instead.
      slideNode.style.opacity = String(1 - normalized * 0.6)
      slideNode.style.filter = `blur(${(normalized * 3).toFixed(2)}px)`
      if (slideNode.firstElementChild) {
        // A CSS custom property, not `transform` itself: writing `transform`
        // directly here would permanently win over the card's own `:hover`
        // lift rule (inline styles always beat stylesheet rules). The actual
        // `transform` is computed in CSS from this variable, so `:hover` can
        // still compose with it.
        slideNode.firstElementChild.style.setProperty('--center-scale', (1 - normalized * 0.1).toFixed(3))
      }
    })
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return undefined
    applyCenterFocus()
    emblaApi.on('scroll', applyCenterFocus)
    emblaApi.on('reInit', applyCenterFocus)
    return () => {
      emblaApi.off('scroll', applyCenterFocus)
      emblaApi.off('reInit', applyCenterFocus)
    }
  }, [emblaApi, applyCenterFocus])

  useEffect(() => {
    emblaApi?.reInit()
  }, [emblaApi, category])

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`rounded-full px-4 py-2 font-semibold transition-colors duration-200 ${
              category === cat.value ? 'bg-brand-teal text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand-ink'
            }`}
            onClick={() => setCategory(cat.value)}
            type="button"
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="portfolio-carousel-wrap relative mx-auto mt-6 max-w-[900px] overflow-hidden rounded-2xl bg-slate-950/20 py-6" ref={emblaRef}>
        <div className="flex gap-5 px-10">
          {filteredItems.map((project) => (
            <div key={project.id} className="min-w-[340px] flex-shrink-0 transition-[opacity,filter] duration-150">
              <PortfolioCard project={project} onClick={() => setSelectedProject(project)} />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => emblaApi?.scrollPrev()}
          className="portfolio-carousel-arrow absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white p-3 text-brand-teal shadow-lg"
          aria-label="Previous project"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => emblaApi?.scrollNext()}
          className="portfolio-carousel-arrow absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white p-3 text-brand-teal shadow-lg"
          aria-label="Next project"
        >
          ›
        </button>
      </div>

      <ProjectDetailModal
        project={selectedProject}
        isOpen={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        onImageClick={(image) => setSelectedImage(image)}
        suppressEscape={Boolean(selectedImage)}
      />

      <ImageModal
        image={selectedImage?.optimized || null}
        alt={selectedImage?.altText || 'Portfolio project screenshot'}
        isOpen={Boolean(selectedImage)}
        onClose={() => setSelectedImage(null)}
        caption={selectedImage?.altText || ''}
        lockScroll={false}
      />
    </>
  )
}

export default PortfolioGallery
