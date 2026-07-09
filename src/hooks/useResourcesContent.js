import { useEffect, useMemo, useState } from 'react'
import { resourcesContent } from '../data/resourcesContent'
import { fetchJsonOnce } from '../utils/cachedFetch'

function normalizeResourcesPayload(payload) {
  if (!payload) return null

  if (Array.isArray(payload.posts) && payload.posts.length > 0) {
    return payload
  }

  if (Array.isArray(payload.guides) && payload.guides.length > 0) {
    return {
      posts: payload.guides.map((guide) => ({
        ...guide,
        slug: guide.slug || guide.id,
        contentType: guide.contentType || 'guide',
        body: guide.body || '',
        coverImageUrl: guide.coverImageUrl || '',
        tags: Array.isArray(guide.tags) ? guide.tags : [],
        authorName: guide.authorName || 'DevLab Studios',
        publishedAt: guide.publishedAt || '',
        readingTimeMinutes: guide.readingTimeMinutes ?? null,
        isFeatured: Boolean(guide.isFeatured),
      })),
      playbook: Array.isArray(payload.playbook) ? payload.playbook : [],
    }
  }

  return null
}

export function useResourcesContent() {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadContent() {
      const payload = await fetchJsonOnce('/api/resources')
      const normalized = normalizeResourcesPayload(payload?.data)
      const hasData = payload?.configured && Array.isArray(normalized?.posts) && normalized.posts.length > 0
      if (!ignore && hasData) {
        setApiContent(normalized)
      }
    }

    loadContent()

    return () => {
      ignore = true
    }
  }, [])

  return useMemo(() => apiContent || resourcesContent, [apiContent])
}

export default useResourcesContent
