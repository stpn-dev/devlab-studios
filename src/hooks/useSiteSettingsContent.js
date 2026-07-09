import { useEffect, useMemo, useState } from 'react'
import siteSettingsContent from '../data/siteSettingsContent'

const staticSiteSettings = siteSettingsContent

export function useSiteSettingsContent() {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSiteSettings() {
      try {
        const response = await fetch('/api/site-settings')
        if (!response.ok) return

        const payload = await response.json()
        if (!cancelled && payload?.data) {
          setApiContent(payload.data)
        }
      } catch {
        // Keep static fallback.
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
