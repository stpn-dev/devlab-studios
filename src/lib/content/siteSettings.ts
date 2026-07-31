import { getSiteSettingsContent } from '../../worker/repositories/content.js'
import { siteSettingsContent } from '../../data/siteSettingsContent.js'
import { getEnv } from '../env'

export interface SiteSettingsData {
  navigation: Array<{ label: string; href: string }>
  ctas: { navbarContactLabel?: string; mobileContactLabel?: string }
  footer: {
    companyName?: string
    tagline?: string
    email?: string
    location?: string
    copyright?: string
    legalLinks?: Array<{ label: string; href: string }>
    quickLinks?: Array<{ label: string; href: string }>
    socialLinks?: Array<{ label: string; href: string }>
  }
}

/**
 * Server-side equivalent of the old useSiteSettingsContent() client hook —
 * queries D1 directly during render instead of shipping static content
 * then re-fetching in the browser. Falls back to the same static data the
 * client hook used if D1 is unconfigured or the query fails.
 */
export async function loadSiteSettings(): Promise<SiteSettingsData> {
  const env = getEnv()
  if (!env.DB) return siteSettingsContent

  try {
    const data = await getSiteSettingsContent(env.DB)
    if (!data?.navigation?.length) return siteSettingsContent
    return data
  } catch {
    return siteSettingsContent
  }
}
