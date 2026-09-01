import { CheckCircle2, Clock, AlertTriangle, LogOut, ListOrdered, Swords, Pause, UserCheck } from '../../components/icons/icons'

// Icon + label + semantic tone for every attendance/availability/queue/game
// status this app tracks today. Mirrors CourtCard.jsx's STATE_CONFIG
// precedent: a status key maps to a default icon/label/tone so most call
// sites only need to pass `status`, while `icon`/`label` props let a caller
// override either one for a status this map doesn't cover yet (or hasn't
// been extended to cover), so any page can reuse this chip without waiting
// on the map. Tone is one of the four `--pb-status-*` tokens defined in
// pickleball.css (never color alone -- every tone always ships with the
// icon + label below).
const STATUS_CONFIG = {
  NOT_CHECKED_IN: { icon: Clock, label: 'Not checked in', tone: 'muted' },
  CHECKED_IN: { icon: UserCheck, label: 'Checked in', tone: 'success' },
  LEFT_SESSION: { icon: LogOut, label: 'Left session', tone: 'danger' },
  AVAILABLE: { icon: CheckCircle2, label: 'Available', tone: 'success' },
  TEMPORARILY_UNAVAILABLE: { icon: AlertTriangle, label: 'Unavailable', tone: 'warning' },
  RESTING: { icon: Pause, label: 'Resting', tone: 'info' },
  QUEUED: { icon: ListOrdered, label: 'Queued', tone: 'info' },
  PLAYING: { icon: Swords, label: 'Playing', tone: 'success' },
}

/**
 * A small icon + text status pill for a player's attendance/availability (or
 * queue/game) state. Every status is communicated by this icon and its
 * label text, never by color alone.
 *
 * @param {Object} props
 * @param {string} props.status - a key from STATUS_CONFIG (e.g. 'CHECKED_IN',
 *   'AVAILABLE'); an unrecognized status still renders (falls back to a
 *   muted clock icon with the raw status string as its label).
 * @param {React.ComponentType} [props.icon] - overrides the default icon for `status`.
 * @param {string} [props.label] - overrides the default label for `status`.
 */
export default function PlayerStatusChip({ status, icon, label }) {
  const config = STATUS_CONFIG[status] || { icon: Clock, label: status, tone: 'muted' }
  const Icon = icon || config.icon
  const text = label || config.label

  return (
    <span className={`pb-status-chip pb-status-chip--${config.tone}`}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" strokeWidth={2.5} />
      {text}
    </span>
  )
}
