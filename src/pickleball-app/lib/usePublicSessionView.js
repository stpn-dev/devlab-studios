import { useEffect, useState } from 'react'
import { useSessionRealtime } from './useSessionRealtime'

const POLL_INTERVAL_MS = 5000

async function fetchPublicState(code) {
  const response = await fetch(`/api/pickleball/public/${code}/state`)
  if (!response.ok) throw new Error('Not found.')
  return response.json()
}

export function usePublicSessionView(code) {
  const [view, setView] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let ignore = false
    fetchPublicState(code)
      .then((data) => {
        if (!ignore) setView(data)
      })
      .catch(() => {
        if (!ignore) setLoadError(true)
      })
    return () => {
      ignore = true
    }
  }, [code])

  const wsUrl = loadError ? null : `${window.location.origin.replace('http', 'ws')}/pickleball/rt/public/${code}`
  const { snapshot, status } = useSessionRealtime(wsUrl)

  // Mirror a freshly-arrived WS snapshot into `view` during render (not in
  // an effect -- this is the "adjust state when a prop/state value changes"
  // pattern, same render-phase-reset shape used by the fetchKey guards in
  // LeaderboardPage/PlayerProfilePage/SessionControlPage) so it never trips
  // react-hooks/set-state-in-effect. `snapshot` is a fresh object on every
  // real STATE message, so `snapshot !== lastSnapshot` only fires on a
  // genuinely new message, not on every render.
  const [lastSnapshot, setLastSnapshot] = useState(null)
  if (snapshot && snapshot !== lastSnapshot) {
    setLastSnapshot(snapshot)
    setView(snapshot)
  }

  // Spec §9: while the socket isn't open (initial connect, or a dropped
  // connection mid-backoff), fall back to polling the REST snapshot every
  // 5s so the view keeps advancing instead of freezing during an outage --
  // graceful degradation, never a blank/stale screen.
  useEffect(() => {
    if (loadError || status === 'open') return undefined
    const timer = setInterval(() => {
      fetchPublicState(code)
        .then((data) => setView(data))
        .catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [code, loadError, status])

  return { view, loadError }
}
