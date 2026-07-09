import { useEffect, useMemo, useState } from 'react'
import { getStaticProfileContent } from '../data/profileContent'

const staticProfileContent = getStaticProfileContent()

export function useProfileContent() {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadContent() {
      try {
        const response = await fetch('/api/profile-content')
        if (!response.ok) return

        const payload = await response.json()
        const data = payload?.data
        const hasData = payload?.configured && (
          Boolean(data?.about?.name)
          || (Array.isArray(data?.experiences) && data.experiences.length > 0)
          || (Array.isArray(data?.skills?.technical) && data.skills.technical.length > 0)
        )

        if (!ignore && hasData) {
          setApiContent(data)
        }
      } catch {
        // Static fallback keeps profile page resilient during CMS migration.
      }
    }

    loadContent()

    return () => {
      ignore = true
    }
  }, [])

  return useMemo(() => apiContent || staticProfileContent, [apiContent])
}

export default useProfileContent
