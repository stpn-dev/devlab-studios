import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import { hasPermission } from '../../lib/pickleball/permissions'
import PublicLinkQRCode from '../components/PublicLinkQRCode'
import MetricCard from '../components/MetricCard'
import SessionStatusChip from '../components/SessionStatusChip'
import { SkeletonBlock, SkeletonMetricCard } from '../components/SkeletonLoader'
import { Activity, ClipboardList, ListOrdered, Grid3x3, Play, Pause, CheckCircle2, Close } from '../../components/icons/icons'

// Mirrors src/lib/pickleball/sessionStateMachine.ts's TARGET_TRANSITIONS --
// this only decides which buttons to *show* for the session's current
// status; the actual transition is validated server-side by that same
// state machine, so an out-of-date mapping here would just show a button
// that 409s, never allow an illegal transition to silently succeed.
const ACTIONS_BY_STATUS = {
  DRAFT: [{ target: 'OPEN_FOR_CHECKIN', label: 'Open check-in', icon: Play, variant: 'primary' }],
  OPEN_FOR_CHECKIN: [{ target: 'LIVE', label: 'Start session', icon: Play, variant: 'primary' }],
  LIVE: [
    { target: 'PAUSED', label: 'Pause', icon: Pause, variant: 'secondary' },
    { target: 'COMPLETED', label: 'Complete session', icon: CheckCircle2, variant: 'primary' },
  ],
  PAUSED: [
    { target: 'LIVE', label: 'Resume', icon: Play, variant: 'primary' },
    { target: 'COMPLETED', label: 'Complete session', icon: CheckCircle2, variant: 'secondary' },
  ],
  COMPLETED: [],
  CANCELLED: [],
}

// Cancel is reachable from any non-terminal status (see cancelSession in
// sessionStateMachine.ts) and is deliberately kept visually distinct
// (danger styling) from the forward-progress actions above.
const CANCELLABLE_STATUSES = ['DRAFT', 'OPEN_FOR_CHECKIN', 'LIVE', 'PAUSED']

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
  const { sessionId, session, snapshot, authRole, isPlatformAdmin, onSessionUpdated } = useOutletContext()
  const [publicCode, setPublicCode] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)
  const [message, setMessage] = useState(null)
  const [busyTarget, setBusyTarget] = useState(null)

  const canManageSessions = hasPermission({ role: authRole, isPlatformAdmin }, 'MANAGE_SESSIONS')

  async function transition(targetStatus) {
    setMessage(null)
    setBusyTarget(targetStatus)
    try {
      const result = await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/status`, { status: targetStatus })
      onSessionUpdated(result.session)
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setBusyTarget(null)
    }
  }

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
      {canManageSessions && (ACTIONS_BY_STATUS[session.status].length > 0 || CANCELLABLE_STATUSES.includes(session.status)) ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="pb-eyebrow">Session actions</p>
          <div className="flex flex-wrap gap-2">
            {ACTIONS_BY_STATUS[session.status].map(({ target, label, icon: Icon, variant }) => (
              <button
                key={target}
                type="button"
                disabled={busyTarget !== null}
                onClick={() => transition(target)}
                className={
                  variant === 'primary'
                    ? 'pb-btn-primary inline-flex min-h-11 items-center justify-center gap-1.5 rounded px-4 text-sm font-semibold disabled:opacity-50'
                    : 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50'
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {busyTarget === target ? 'Working…' : label}
              </button>
            ))}
            {CANCELLABLE_STATUSES.includes(session.status) ? (
              <button
                type="button"
                disabled={busyTarget !== null}
                onClick={() => transition('CANCELLED')}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded border border-rose-300 px-4 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <Close className="h-4 w-4" aria-hidden="true" />
                {busyTarget === 'CANCELLED' ? 'Working…' : 'Cancel session'}
              </button>
            ) : null}
          </div>
          {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
        </div>
      ) : null}
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
