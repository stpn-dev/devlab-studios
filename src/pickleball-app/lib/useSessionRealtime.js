import { useEffect, useRef, useState } from 'react'

export function nextBackoffDelayMs(attempt) {
  return Math.min(1000 * 2 ** attempt, 8000)
}

// Opens `wsUrl` (an operator or public /pickleball/rt/... URL) and keeps
// `snapshot` as the LATEST full STATE payload -- the realtime design's own
// full-snapshot-not-diff choice means this never needs merge/patch logic,
// just "replace on every message." On close, reconnects with capped
// backoff, keeping the last known snapshot visible (status flips to
// 'closed' so callers can render a small "reconnecting..." indicator)
// rather than blanking the UI -- matching the realtime design's own
// reconnect-is-just-a-fresh-connect philosophy (see the realtime spec's
// Decision 3 and the reconnect e2e test in pickleball-realtime.spec.js).
export function useSessionRealtime(wsUrl) {
  const [status, setStatus] = useState('connecting')
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    if (!wsUrl) return undefined

    let socket
    let reconnectTimer
    let cancelled = false

    function connect() {
      setStatus('connecting')
      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        attemptRef.current = 0
        setStatus('open')
        setError(null)
      }

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'STATE') setSnapshot(parsed.payload)
        } catch {
          // Malformed message -- ignore, the next one will still be valid.
        }
      }

      socket.onerror = () => {
        setError('Connection error.')
      }

      socket.onclose = () => {
        if (cancelled) return
        setStatus('closed')
        const delay = nextBackoffDelayMs(attemptRef.current)
        attemptRef.current += 1
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [wsUrl])

  return { status, snapshot, error }
}
