import { useOutletContext } from 'react-router-dom'

export default function SessionControlPage() {
  const { session, snapshot } = useOutletContext()

  if (!session) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Status</dt>
          <dd className="text-lg font-semibold text-slate-900">{session.status}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Type</dt>
          <dd className="text-lg font-semibold text-slate-900">{session.sessionType}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Queued</dt>
          <dd className="text-lg font-semibold text-slate-900" data-testid="queue-count">{snapshot ? snapshot.queue.filter((entry) => entry.status === 'QUEUED').length : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-slate-500">Courts</dt>
          <dd className="text-lg font-semibold text-slate-900" data-testid="courts-count">{snapshot ? snapshot.courts.length : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
