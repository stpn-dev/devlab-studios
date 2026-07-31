import { useEffect, useState } from 'react'
import { adminApi } from '../lib/adminApi'

const STATUS_TONES = {
  pending: 'bg-amber-100 text-amber-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
}

function StatusBadge({ status }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONES[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>
}

function LeadsPage() {
  const [leads, setLeads] = useState([])
  const [status, setStatus] = useState('loading')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    let ignore = false
    const query = filter ? `?status=${filter}` : ''
    adminApi
      .get(`/api/admin/leads${query}`)
      .then((data) => !ignore && (setLeads(data), setStatus('ready')))
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [filter])

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    let ignore = false
    adminApi.get(`/api/admin/leads/${selected}`).then((data) => !ignore && setDetail(data))
    return () => {
      ignore = true
    }
  }, [selected])

  async function handleRetry() {
    if (!selected) return
    setIsRetrying(true)
    try {
      const updated = await adminApi.post(`/api/admin/leads/${selected}/retry`, {})
      setDetail(updated)
      setLeads((current) => current.map((lead) => (lead.id === updated.id ? updated : lead)))
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load leads.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead.id)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selected === lead.id ? 'bg-brand-mint/30' : ''}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">{new Date(lead.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{lead.name}</p>
                    <p className="text-xs text-slate-500">{lead.email}</p>
                  </td>
                  <td className="px-4 py-3">{lead.subject}</td>
                  <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                </tr>
              ))}
              {!leads.length && status === 'ready' ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">No leads yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div>
          {detail ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Message</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{detail.message}</p>
              </div>
              <div className="flex items-center justify-between">
                <StatusBadge status={detail.status} />
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {isRetrying ? 'Retrying…' : 'Retry Delivery'}
                </button>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Delivery Attempts</p>
                <ul className="mt-2 space-y-2">
                  {(detail.attempts || []).map((attempt) => (
                    <li key={attempt.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Attempt {attempt.attemptNumber} — {attempt.target}</span>
                        <span className={attempt.status === 'success' ? 'text-emerald-700' : 'text-rose-600'}>{attempt.status}</span>
                      </div>
                      <p className="mt-1 text-slate-500">{new Date(attempt.attemptedAt).toLocaleString()}</p>
                      {attempt.errorMessage ? <p className="mt-1 text-rose-600">{attempt.errorMessage}</p> : null}
                    </li>
                  ))}
                  {!detail.attempts?.length ? <li className="text-xs text-slate-500">No delivery attempts recorded.</li> : null}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a lead to view details.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default LeadsPage
