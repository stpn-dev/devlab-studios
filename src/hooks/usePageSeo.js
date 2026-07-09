import { useEffect, useMemo, useState } from 'react'
import seoContent from '../data/seoContent'

const staticSeoPages = seoContent.pages || []

function getStaticSeo(pageSlug) {
  return staticSeoPages.find((item) => item.pageSlug === pageSlug) || null
}

export function usePageSeo(pageSlug) {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSeo() {
      try {
        const response = await fetch(`/api/seo/${pageSlug}`)
        if (!response.ok) return

        const payload = await response.json()
        if (!cancelled && payload?.data) {
          setApiContent(payload.data)
        }
      } catch {
        // Keep static fallback.
      }
    }

    loadSeo()
    return () => {
      cancelled = true
    }
  }, [pageSlug])

  return useMemo(() => apiContent || getStaticSeo(pageSlug), [apiContent, pageSlug])
}

export default usePageSeo
