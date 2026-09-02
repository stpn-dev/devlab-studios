import { Clock, UserCheck, Activity, Pause, CheckCircle2, X } from '../../components/icons/icons'

// Session status chip -- a dedicated variant (per the task's own "or a
// dedicated session-status variant" option) rather than editing
// PlayerStatusChip.jsx's STATUS_CONFIG, since that map is scoped to
// player/game/queue attendance states. Same visual language though: icon +
// text + one of the four existing --pb-status-* tones (never color alone),
// covering the exact status vocabulary this app's schema defines (see
// createSessionSchema's z.enum in src/lib/schemas/pickleball/sessions.ts).
//
// Shared by SessionsListPage.jsx (session cards) and SessionControlPage.jsx
// (the control-center "Status" metric) so both surfaces show the same
// treatment for the same status value rather than one showing this chip and
// the other a raw enum string.
const SESSION_STATUS_CONFIG = {
  DRAFT: { icon: Clock, label: 'Draft', tone: 'muted' },
  OPEN_FOR_CHECKIN: { icon: UserCheck, label: 'Check-in open', tone: 'info' },
  LIVE: { icon: Activity, label: 'Live', tone: 'success' },
  PAUSED: { icon: Pause, label: 'Paused', tone: 'warning' },
  COMPLETED: { icon: CheckCircle2, label: 'Completed', tone: 'muted' },
  CANCELLED: { icon: X, label: 'Cancelled', tone: 'danger' },
}

/**
 * @param {Object} props
 * @param {string} props.status - a session's raw `status` enum value.
 */
export default function SessionStatusChip({ status }) {
  const config = SESSION_STATUS_CONFIG[status] || { icon: Clock, label: status, tone: 'muted' }
  const Icon = config.icon
  return (
    <span className={`pb-status-chip pb-status-chip--${config.tone}`}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" strokeWidth={2.5} />
      {config.label}
    </span>
  )
}
