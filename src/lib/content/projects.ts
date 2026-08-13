import { listProjects } from '../../worker/repositories/projects.js'
import { normalizeProjectMedia } from '../media'
import { portfolioItems } from '../../data/portfolio.js'
import { getEnv } from '../env'
import { optimizeImage, type OptimizedPicture } from '../images/optimizeImage'
import type { ImageMetadata } from 'astro'

type ImageSource = ImageMetadata | string | undefined

interface GalleryImage {
  url?: ImageSource
  optimized?: OptimizedPicture | null
  [key: string]: unknown
}

export interface ProjectData {
  id: string
  title: string
  description: string
  type: string
  image?: ImageSource
  optimizedImage?: OptimizedPicture | null
  imageUrl?: string
  galleryImages?: GalleryImage[]
  liveUrl?: string
  sourceUrl?: string
  techStack?: string[]
  [key: string]: unknown
}

/**
 * D1 rows, before merging with the static fallback, only ever carry string
 * URLs (never local ImageMetadata) — normalizeProjectMedia relies on that.
 * Kept distinct from ProjectData (whose `image`/`galleryImages[].url` widen
 * to ImageMetadata post-merge) so the generic constraint on
 * normalizeProjectMedia<T extends ProjectMedia> below is satisfied.
 */
interface RawProjectRow {
  id: string
  imageUrl?: string
  galleryImages?: { url?: string; [key: string]: unknown }[]
  [key: string]: unknown
}

const normalizedPortfolioItems: ProjectData[] = portfolioItems

function mergeWithStaticImages(projects: ProjectData[]): ProjectData[] {
  const staticById = new Map(normalizedPortfolioItems.map((project) => [project.id, project]))
  const cmsIds = new Set(projects.map((project) => project.id))

  const mergedProjects = projects.map((project) => {
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

  return [
    ...mergedProjects,
    ...normalizedPortfolioItems.filter((project) => !cmsIds.has(project.id)),
  ]
}

const COVER_IMAGE_SIZE = { width: 640, height: 480, fit: 'cover' as const }
// Capped at 960 (so the 2x density variant requests 1920) rather than 1200
// (which would request 2400 at 2x) — project screenshots are typically
// ~1920px wide at most, so a wider target just upscales past the source
// with no visual gain.
const GALLERY_IMAGE_SIZE = { width: 960, height: 540, fit: 'cover' as const }

async function attachOptimizedImages(projects: ProjectData[]): Promise<ProjectData[]> {
  return Promise.all(
    projects.map(async (project) => ({
      ...project,
      optimizedImage: await optimizeImage(project.image, COVER_IMAGE_SIZE),
      galleryImages: await Promise.all(
        (project.galleryImages || []).map(async (image) => ({
          ...image,
          optimized: await optimizeImage(image.url, GALLERY_IMAGE_SIZE),
        })),
      ),
    })),
  )
}

/**
 * Server-side equivalent of the old useProjects() client hook — queries D1
 * directly during render and merges in the static bundled screenshots that
 * D1 doesn't store, instead of shipping static content then re-fetching.
 */
export async function loadProjects(): Promise<ProjectData[]> {
  const env = getEnv()
  if (!env.DB) return attachOptimizedImages(normalizedPortfolioItems)

  try {
    const projects = await listProjects(env.DB)
    if (!projects.length) return await attachOptimizedImages(normalizedPortfolioItems)
    return await attachOptimizedImages(
      mergeWithStaticImages(projects.map((project: RawProjectRow) => normalizeProjectMedia(project, env))),
    )
  } catch {
    return attachOptimizedImages(normalizedPortfolioItems)
  }
}
