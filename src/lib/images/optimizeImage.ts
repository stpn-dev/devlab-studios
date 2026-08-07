import { getImage } from 'astro:assets'
import type { ImageMetadata } from 'astro'

export interface OptimizedPicture {
  src: string
  width: number
  height: number
  avifSrcSet: string
  webpSrcSet: string
}

export interface OptimizeImageOptions {
  width: number
  height: number
  fit?: 'cover' | 'contain'
}

/**
 * Builds AVIF+WebP srcsets at fixed target dimensions via the Cloudflare
 * Images binding (see astro.config.mjs). Fixed width/height (not
 * `inferSize`) means this never fetches the source image itself — it only
 * builds a `/_image?...` URL — so calling this from an SSR content loader
 * adds no per-request network cost. The actual transform happens lazily,
 * on the browser's first request for that URL, and is cached immutably
 * after that (see @astrojs/cloudflare's image-transform-endpoint).
 */
export async function optimizeImage(
  source: ImageMetadata | string | undefined,
  { width, height, fit = 'cover' }: OptimizeImageOptions,
): Promise<OptimizedPicture | null> {
  if (!source) return null

  const shared = {
    src: source,
    width,
    height,
    fit,
    densities: [1, 2],
    inferSize: false as const,
  }

  const [avif, webp] = await Promise.all([
    getImage({ ...shared, format: 'avif' }),
    getImage({ ...shared, format: 'webp' }),
  ])

  return {
    src: webp.src,
    width: webp.attributes.width as number,
    height: webp.attributes.height as number,
    avifSrcSet: avif.srcSet.attribute,
    webpSrcSet: webp.srcSet.attribute,
  }
}
