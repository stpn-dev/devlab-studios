import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function AuditPage() {
  const { activeOrgId } = useOutletContext()
  const [events, setEvents] = useState(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = `${activeOrgId}:${page}`
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setEvents(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/organizations/${activeOrgId}/audit-events?page=${page}`)
      .then((data) => {
        if (!ignore) {
          setEvents(data.events)
          setPageSize(data.pageSize)
        }
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [activeOrgId, page])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Audit Log</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>

      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      {events === null && !message ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {events ? (
        <div className="space-y-2" data-testid="audit-events-list">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{event.action}</span>
                <span className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-slate-500">
                {event.actorName || event.actorEmail || 'Unknown actor'} · {event.entityType} {event.entityId}
              </p>
            </div>
          ))}
          {!events.length ? <p className="text-sm text-slate-500">No audit events yet.</p> : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-slate-500">Page {page + 1}</span>
        <button
          type="button"
          onClick={() => setPage((current) => current + 1)}
          disabled={!events || events.length < pageSize}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  )
}
