import { useEffect, useState } from 'react'
import { adminApi } from '../lib/adminApi'

function AuditLogPage() {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let ignore = false
    adminApi
      .get('/api/admin/audit-log')
      .then((data) => !ignore && (setEvents(data), setStatus('ready')))
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Audit Log</h1>
      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load the audit log.</p> : null}

      {status === 'ready' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{event.actorEmail || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{event.action}</span>
                  </td>
                  <td className="px-4 py-3">
                    {event.entityType}
                    {event.entityId ? <span className="text-slate-400"> · {event.entityId}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{Object.keys(event.metadata || {}).length ? JSON.stringify(event.metadata) : '—'}</td>
                </tr>
              ))}
              {!events.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No audit events recorded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export default AuditLogPage
