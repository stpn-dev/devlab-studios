import { useMemo, useState } from 'react'
import ResponsivePicture from '../ResponsivePicture'
import ImageModal from '../ImageModal'
import { ChevronLeft, ChevronRight, Image } from '../icons/icons'

function sourceKey(source, fallback) {
  if (typeof source === 'string') return source
  if (source?.src) return source.src
  return fallback
}

export default function WorkProjectGallery({ project }) {
  const images = useMemo(() => {
    const candidates = []
    if (project?.image && project?.optimizedImage) {
      candidates.push({
        id: `${project.id}-work-cover`,
        url: project.image,
        optimized: project.optimizedImage,
        altText: `${project.title} cover image`,
      })
    }
    for (const image of project?.galleryImages || []) {
      if (image?.optimized) candidates.push(image)
    }

    const seen = new Set()
    return candidates.filter((image, index) => {
      const key = sourceKey(image.url, image.id || String(index))
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [project])

  const [activeIndex, setActiveIndex] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const activeImage = images[activeIndex] || images[0] || null

  function previous() {
    setActiveIndex((current) => (current <= 0 ? images.length - 1 : current - 1))
  }

  function next() {
    setActiveIndex((current) => (current >= images.length - 1 ? 0 : current + 1))
  }

  if (!activeImage) {
    return (
      <div className="flex min-h-72 items-center justify-center gap-2 bg-slate-100 text-sm text-slate-500">
        <Image size={18} aria-hidden="true" /> No Project images available
      </div>
    )
  }

  return (
    <>
      <div className="work-gallery border-b border-slate-200 bg-slate-100">
        <button type="button" onClick={() => setIsExpanded(true)} className="group relative block w-full overflow-hidden" aria-label={`Enlarge ${project.title} image ${activeIndex + 1}`}>
          <ResponsivePicture
            image={activeImage.optimized}
            alt={activeImage.altText || `${project.title} image ${activeIndex + 1}`}
            className="h-[22rem] w-full object-cover object-center transition duration-500 group-hover:scale-[1.015] sm:h-[30rem]"
          />
          <span className="absolute bottom-4 right-4 rounded-full border border-white/20 bg-slate-950/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">View full image</span>
        </button>

        {images.length > 1 ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={image.id || sourceKey(image.url, String(index))}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Show ${project.title} image ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  className={`h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${index === activeIndex ? 'border-brand-teal' : 'border-transparent opacity-65 hover:opacity-100'}`}
                >
                  <ResponsivePicture image={image.optimized} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex flex-shrink-0 items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs font-semibold text-slate-500">{activeIndex + 1} / {images.length}</p>
              <div className="flex gap-2">
                <button type="button" onClick={previous} aria-label={`Previous ${project.title} image`} className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:border-brand-teal/40 hover:text-brand-teal"><ChevronLeft size={16} /></button>
                <button type="button" onClick={next} aria-label={`Next ${project.title} image`} className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:border-brand-teal/40 hover:text-brand-teal"><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ImageModal
        image={activeImage.optimized}
        alt={activeImage.altText || `${project.title} image ${activeIndex + 1}`}
        caption={activeImage.altText || project.title}
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
      />
    </>
  )
}
