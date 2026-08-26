import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function CourtsPage() {
  const { sessionId, snapshot } = useOutletContext()
  const [enabledByCourtId, setEnabledByCourtId] = useState({})
  const [message, setMessage] = useState(null)

  async function loadEnabledFlags() {
    const { courts } = await pickleballApi.get(`/api/pickleball/sessions/${sessionId}/courts`)
    setEnabledByCourtId(Object.fromEntries(courts.map((c) => [c.id, c.enabled])))
  }

  useEffect(() => {
    loadEnabledFlags().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function runAction(actionPromise, { refreshEnabled } = {}) {
    setMessage(null)
    try {
      await actionPromise
      if (refreshEnabled) await loadEnabledFlags()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  if (!snapshot) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Courts</h1>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="courts-grid">
        {snapshot.courts.map((court) => {
          const enabled = enabledByCourtId[court.id]
          return (
            <div key={court.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{court.courtName}</span>
                <span className="text-xs text-slate-500">{court.status}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {court.status === 'AVAILABLE' ? (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { sessionCourtId: court.id }))} className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:brightness-95">
                    Assign
                  </button>
                ) : null}
                {court.status === 'ASSIGNED' ? (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/release`, { sessionCourtId: court.id }))} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                    Release
                  </button>
                ) : null}
                {enabled === false ? (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/enable`, { sessionCourtId: court.id }), { refreshEnabled: true })} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                    Enable
                  </button>
                ) : (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/disable`, { sessionCourtId: court.id }), { refreshEnabled: true })} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                    Disable
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
