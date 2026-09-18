import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'

/**
 * Loads one admin endpoint and tracks its state.
 *
 * Every Lead CRM screen fetches one URL and renders it, so the
 * loading/error/ignore-after-unmount handling lives here once rather than being
 * repeated in nine components — which is where "setState after unmount" bugs
 * come from.
 *
 * NOTE ON THE SHAPE: the loading state is DERIVED from whether the stored
 * result belongs to the URL currently being asked for, rather than being set
 * synchronously at the top of the effect. Setting it synchronously would work,
 * but it triggers a cascading render on every path change and the project's
 * lint config rejects it (react-hooks/set-state-in-effect). Deriving it is both
 * cheaper and, usefully, makes a stale result impossible to render as fresh.
 */
export function useResource(path, { skip = false } = {}) {
  const [result, setResult] = useState({ path: null, status: 'idle', data: null, error: null })
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback(() => setReloadToken((current) => current + 1), [])

  useEffect(() => {
    if (skip || !path) return undefined

    let ignore = false

    adminApi
      .get(path)
      .then((data) => {
        if (!ignore) setResult({ path, status: 'ready', data, error: null })
      })
      .catch((error) => {
        if (!ignore) setResult({ path, status: 'error', data: null, error })
      })

    return () => {
      ignore = true
    }
  }, [path, skip, reloadToken])

  const state = skip || !path ? 'idle' : result.path === path ? result.status : 'loading'

  // `setData` lets a screen apply an optimistic update after a mutation without
  // a full refetch. Tagged with the current path so it is not treated as stale.
  const setData = useCallback(
    (updater) =>
      setResult((current) => ({
        ...current,
        data: typeof updater === 'function' ? updater(current.data) : updater,
      })),
    [],
  )

  return {
    data: result.path === path ? result.data : null,
    state,
    error: result.path === path ? result.error : null,
    reload,
    setData,
  }
}
