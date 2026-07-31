import { listProjects } from '../../worker/repositories/projects.js'
import { normalizeProjectMedia } from '../media'
import { portfolioItems } from '../../data/portfolio.js'
import { getEnv } from '../env'

interface GalleryImage {
  url?: string
  [key: string]: unknown
}

interface ProjectData {
  id: string
  image?: string
  imageUrl?: string
  galleryImages?: GalleryImage[]
  liveUrl?: string
  sourceUrl?: string
  techStack?: string[]
  [key: string]: unknown
}

/**
 * Local image imports resolve to an ImageMetadata object ({src, width,
 * height, format}) under Astro's asset pipeline, not a plain URL string —
 * unwrap it so downstream <img src> usage doesn't render "[object Object]".
 */
function resolveImageSrc(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'src' in value) {
    return (value as { src: string }).src
  }
  return typeof value === 'string' ? value : undefined
}

function normalizeStaticProject(project: ProjectData): ProjectData {
  return {
    ...project,
    image: resolveImageSrc(project.image),
    galleryImages: Array.isArray(project.galleryImages)
      ? project.galleryImages.map((image) => ({ ...image, url: resolveImageSrc(image.url) }))
      : project.galleryImages,
  }
}

const normalizedPortfolioItems: ProjectData[] = portfolioItems.map(normalizeStaticProject)

function mergeWithStaticImages(projects: ProjectData[]): ProjectData[] {
  const staticById = new Map(normalizedPortfolioItems.map((project) => [project.id, project]))

  return projects.map((project) => {
    const fallback = staticById.get(project.id)
    const apiGallery = Array.isArray(project.galleryImages) ? project.galleryImages.filter((image) => image?.url) : []
    const fallbackGallery = Array.isArray(fallback?.galleryImages) ? fallback.galleryImages : []

    return {
      ...project,
      liveUrl: project.liveUrl || '#',
      sourceUrl: project.sourceUrl || '#',
      techStack: Array.isArray(project.techStack) ? project.techStack : [],
      image: project.imageUrl || apiGallery[0]?.url || fallback?.image,
      galleryImages: apiGallery.length > 0 ? apiGallery : fallbackGallery,
    }
  })
}

/**
 * Server-side equivalent of the old useProjects() client hook — queries D1
 * directly during render and merges in the static bundled screenshots that
 * D1 doesn't store, instead of shipping static content then re-fetching.
 */
export async function loadProjects(): Promise<ProjectData[]> {
  const env = getEnv()
  if (!env.DB) return normalizedPortfolioItems

  try {
    const projects = await listProjects(env.DB)
    if (!projects.length) return normalizedPortfolioItems
    return mergeWithStaticImages(projects.map((project: ProjectData) => normalizeProjectMedia(project, env)))
  } catch {
    return normalizedPortfolioItems
  }
}
