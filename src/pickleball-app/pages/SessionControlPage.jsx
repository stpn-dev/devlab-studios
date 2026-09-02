import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import PublicLinkQRCode from '../components/PublicLinkQRCode'
import MetricCard from '../components/MetricCard'
import SessionStatusChip from '../components/SessionStatusChip'
import { SkeletonBlock, SkeletonMetricCard } from '../components/SkeletonLoader'
import { Activity, ClipboardList, ListOrdered, Grid3x3 } from '../../components/icons/icons'

// "OPEN_PLAY" -> "Open Play", "FIXED_PAIRS" -> "Fixed Pairs" -- generic
// enum-to-title-case, not a hardcoded map, so it keeps working if
// createSessionSchema's z.enum (src/lib/schemas/pickleball/sessions.ts) ever
// gains a value.
function humanizeEnum(value) {
  return value
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

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

  if (!session) {
    return (
      <div className="space-y-4">
        <SkeletonBlock>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
          </div>
        </SkeletonBlock>
      </div>
    )
  }

  const publicUrl = publicCode ? `${window.location.origin}/pickleball/live/${publicCode}` : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard icon={Activity} label="Status" value={<SessionStatusChip status={session.status} />} />
        <MetricCard icon={ClipboardList} label="Type" value={humanizeEnum(session.sessionType)} />
        <MetricCard
          icon={ListOrdered}
          label="Queued"
          value={snapshot ? snapshot.queue.filter((entry) => entry.status === 'QUEUED').length : '—'}
          valueTestId="queue-count"
        />
        <MetricCard icon={Grid3x3} label="Courts" value={snapshot ? snapshot.courts.length : '—'} valueTestId="courts-count" />
      </div>
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
