import { useEffect, useMemo, useState } from 'react'
import { servicesContent } from '../data/servicesContent'

export function useServicesContent() {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadContent() {
      try {
        const response = await fetch('/api/services')
        if (!response.ok) return

        const payload = await response.json()
        const hasData = payload?.configured && Array.isArray(payload?.data?.solutionGroups) && payload.data.solutionGroups.length > 0
        if (!ignore && hasData) {
          setApiContent(payload.data)
        }
      } catch {
        // Static fallback keeps services page resilient during CMS migration.
      }
    }

    loadContent()

    return () => {
      ignore = true
    }
  }, [])

  return useMemo(() => apiContent || servicesContent, [apiContent])
}

export default useServicesContent
