import { useEffect, useMemo, useState } from 'react'
import siteSettingsContent from '../data/siteSettingsContent'
import { fetchJsonOnce } from '../utils/cachedFetch'

const staticSiteSettings = siteSettingsContent

export function useSiteSettingsContent() {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSiteSettings() {
      const payload = await fetchJsonOnce('/api/site-settings')
      if (!cancelled && payload?.data) {
        setApiContent(payload.data)
      }
    }

    loadSiteSettings()
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => apiContent || staticSiteSettings, [apiContent])
}

export default useSiteSettingsContent
