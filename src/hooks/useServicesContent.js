import { useEffect, useMemo, useState } from 'react'
import { servicesContent } from '../data/servicesContent'
import { fetchJsonOnce } from '../utils/cachedFetch'

export function useServicesContent() {
  const [apiContent, setApiContent] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadContent() {
      const payload = await fetchJsonOnce('/api/services')
      const hasData = payload?.configured && Array.isArray(payload?.data?.solutionGroups) && payload.data.solutionGroups.length > 0
      if (!ignore && hasData) {
        setApiContent(payload.data)
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
