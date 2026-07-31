interface GalleryImage {
  url?: string
  [key: string]: unknown
}

interface ProjectMedia {
  imageUrl?: string
  galleryImages?: GalleryImage[]
  [key: string]: unknown
}

export function normalizeMediaUrl(url: string | undefined, env: Env): string {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value

  const publicBaseUrl = String(env.R2_PUBLIC_BASE_URL || '').trim()
  if (!publicBaseUrl) return value

  return `${publicBaseUrl.replace(/\/$/, '')}/${value.replace(/^\/+/, '')}`
}

export function normalizeProjectMedia<T extends ProjectMedia>(project: T, env: Env): T {
  return {
    ...project,
    imageUrl: normalizeMediaUrl(project.imageUrl, env),
    galleryImages: Array.isArray(project.galleryImages)
      ? project.galleryImages.map((image) => ({ ...image, url: normalizeMediaUrl(image.url, env) }))
      : [],
  }
}
