import { useEffect, useMemo, useState } from 'react'
import { portfolioItems } from '../data/portfolio'

function mergeWithStaticImages(projects) {
  const staticById = new Map(portfolioItems.map((project) => [project.id, project]))

  return projects.map((project) => {
    const fallback = staticById.get(project.id)
    return {
      ...project,
      liveUrl: project.liveUrl || '#',
      sourceUrl: project.sourceUrl || '#',
      techStack: Array.isArray(project.techStack) ? project.techStack : [],
      image: project.imageUrl || fallback?.image,
    }
  })
}

export function useProjects() {
  const [apiProjects, setApiProjects] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadProjects() {
      try {
        const response = await fetch('/api/projects')
        if (!response.ok) return
        const payload = await response.json()
        if (!ignore && payload.configured && Array.isArray(payload.data) && payload.data.length > 0) {
          setApiProjects(mergeWithStaticImages(payload.data))
        }
      } catch {
        // Static fallback keeps public pages resilient during CMS migration.
      }
    }

    loadProjects()

    return () => {
      ignore = true
    }
  }, [])

  return useMemo(() => apiProjects || portfolioItems, [apiProjects])
}
