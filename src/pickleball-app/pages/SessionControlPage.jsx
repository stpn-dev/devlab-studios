import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import PublicLinkQRCode from '../components/PublicLinkQRCode'

export default function SessionControlPage() {
  const { sessionId, session, snapshot } = useOutletContext()
  const [publicCode, setPublicCode] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = sessionId
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setPublicCode(null)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}/public-code`)
      .then((data) => {
        if (!ignore) setPublicCode(data.code)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [sessionId])

  if (!session) return <p className="text-sm text-slate-500">Loading…</p>

  const publicUrl = publicCode ? `${window.location.origin}/pickleball/live/${publicCode}` : null

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</dt>
          <dd className="pb-score text-lg text-slate-900">{session.status}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</dt>
          <dd className="pb-score text-lg text-slate-900">{session.sessionType}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Queued</dt>
          <dd className="pb-score text-lg text-slate-900" data-testid="queue-count">{snapshot ? snapshot.queue.filter((entry) => entry.status === 'QUEUED').length : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Courts</dt>
          <dd className="pb-score text-lg text-slate-900" data-testid="courts-count">{snapshot ? snapshot.courts.length : '—'}</dd>
        </div>
      </dl>
      {publicUrl ? (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <PublicLinkQRCode url={publicUrl} />
          <div className="space-y-1 text-sm text-slate-500">
            <p>Public live view:</p>
            <a
              data-testid="public-live-link"
              href={`/pickleball/live/${publicCode}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand underline"
            >
              /pickleball/live/{publicCode}
            </a>
            <p>TV display: <a href={`/pickleball/live/${publicCode}/display`} target="_blank" rel="noreferrer" className="font-semibold text-brand underline">/pickleball/live/{publicCode}/display</a></p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
