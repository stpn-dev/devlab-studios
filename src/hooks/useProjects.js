import { useEffect, useMemo, useState } from 'react'
import { portfolioItems } from '../data/portfolio'
import { fetchJsonOnce } from '../utils/cachedFetch'

function mergeWithStaticImages(projects) {
  const staticById = new Map(portfolioItems.map((project) => [project.id, project]))

  return projects.map((project) => {
    const fallback = staticById.get(project.id)
    const apiGallery = Array.isArray(project.galleryImages) ? project.galleryImages.filter((item) => item?.url) : []
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
}

export function useProjects() {
  const [apiProjects, setApiProjects] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadProjects() {
      const payload = await fetchJsonOnce('/api/projects')
      if (!ignore && payload?.configured && Array.isArray(payload.data) && payload.data.length > 0) {
        setApiProjects(mergeWithStaticImages(payload.data))
      }
    }

    loadProjects()

    return () => {
      ignore = true
    }
  }, [])

  return useMemo(() => apiProjects || portfolioItems, [apiProjects])
}
