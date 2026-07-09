import { useEffect, useMemo, useState } from 'react'
import seoContent from '../data/seoContent'
import { fetchJsonOnce } from '../utils/cachedFetch'

const staticSeoPages = seoContent.pages || []

function getStaticSeo(pageSlug) {
  return staticSeoPages.find((item) => item.pageSlug === pageSlug) || null
}

export function usePageSeo(pageSlug) {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadSeo() {
      const payload = await fetchJsonOnce(`/api/seo/${pageSlug}`)
      if (!cancelled && payload?.data) {
        setApiContent(payload.data)
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
