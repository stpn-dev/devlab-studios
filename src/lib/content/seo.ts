import { getSeoMetadata } from '../../worker/repositories/content.js'
import { seoContent } from '../../data/seoContent.js'
import { getEnv } from '../env'

export interface SeoData {
  metaTitle?: string
  metaDescription?: string
  metaKeywords?: string
  canonicalUrl?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: string
}

function getStaticSeo(pageSlug: string): SeoData | null {
  return seoContent.pages.find((item) => item.pageSlug === pageSlug) || null
}

/** Server-side equivalent of the old usePageSeo(pageSlug) client hook. */
export async function loadPageSeo(pageSlug: string): Promise<SeoData | null> {
  const env = getEnv()
  const fallback = getStaticSeo(pageSlug)
  if (!env.DB) return fallback

  try {
    const data = await getSeoMetadata(env.DB, pageSlug)
    return data || fallback
  } catch {
    return fallback
  }
}
