import { useEffect, useState } from 'react'
import { useSessionRealtime } from './useSessionRealtime'

export function usePublicSessionView(code) {
  const [initial, setInitial] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let ignore = false
    fetch(`/api/pickleball/public/${code}/state`)
      .then((response) => {
        if (!response.ok) throw new Error('Not found.')
        return response.json()
      })
      .then((data) => {
        if (!ignore) setInitial(data)
      })
      .catch(() => {
        if (!ignore) setLoadError(true)
      })
    return () => {
      ignore = true
    }
  }, [code])

  const wsUrl = loadError ? null : `${window.location.origin.replace('http', 'ws')}/pickleball/rt/public/${code}`
  const { snapshot } = useSessionRealtime(wsUrl)

  return { view: snapshot || initial, loadError }
}
