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
    loadEnabledFlags().catch(() => setMessage({ type: 'error', text: 'Could not load court status.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    setEnabledByCourtId({})
  }, [snapshot])

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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Courts</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="courts-grid">
        {snapshot.courts.map((court) => {
          const enabled = court.id in enabledByCourtId ? enabledByCourtId[court.id] : court.enabled
          return (
            <div key={court.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{court.courtName}</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  {court.status === 'ASSIGNED' ? <span className="pb-live-dot" /> : null}
                  {court.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {court.status === 'AVAILABLE' && enabled !== false ? (
                  <button type="button" onClick={() => runAction(pickleballApi.post(`/api/pickleball/sessions/${sessionId}/courts/assign`, { sessionCourtId: court.id }))} className="pb-btn-primary rounded px-3 py-1 text-xs">
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
