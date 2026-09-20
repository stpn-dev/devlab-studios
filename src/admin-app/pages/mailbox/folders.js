/**
 * The folder model behind the mailbox screens, and the ONE resolver that
 * decides which entry is active.
 *
 * WHY A RESOLVER RATHER THAN PER-LINK `isActive`. Machine mail used to be
 * reached as `/admin/mailbox/inbox?mailbox=bounce`, and react-router's NavLink
 * computes `isActive` from the PATHNAME ONLY — it ignores search params. So on
 * that URL the Inbox link matched (`/admin/mailbox/inbox`) and the Bounces link
 * matched the same pathname, and BOTH rendered as selected. Two dark buttons,
 * no single source of truth.
 *
 * Two changes fix that structurally rather than cosmetically:
 *
 *   1. Bounces and DMARC are now first-class routes — `/admin/mailbox/bounces`
 *      and `/admin/mailbox/dmarc` — so a section is identified by its path and
 *      no two sections can share one.
 *   2. Every navigation item asks `resolveMailboxSection()` for the single
 *      active key instead of deciding for itself. One value in, one highlight
 *      out; two simultaneous highlights become unrepresentable.
 *
 * Separated from the components because a module exporting both defeats React
 * Fast Refresh, which this project's lint config enforces.
 */

/** @typedef {{ key: string, label: string, kind: 'threads'|'messages', hint: string }} Folder */

/** @type {Folder[]} */
export const FOLDERS = [
  {
    key: 'inbox',
    label: 'Inbox',
    kind: 'threads',
    hint: 'Mail to hello@devlabconnect.com. Replies from leads land here too.',
  },
  {
    key: 'drafts',
    label: 'Drafts',
    kind: 'messages',
    hint: 'Written but not sent. Nothing here has been handed to the sender.',
  },
  {
    key: 'outbox',
    label: 'Outbox',
    kind: 'messages',
    hint: 'Waiting for the external sender. Not yet on the wire.',
  },
  {
    key: 'sent',
    label: 'Sent',
    kind: 'threads',
    hint: 'Confirmed transmitted by the sender — not merely written.',
  },
  {
    key: 'failed',
    label: 'Failed',
    kind: 'messages',
    hint: 'The sender could not transmit these. They will not retry on their own.',
  },
  {
    key: 'archived',
    label: 'Archive',
    kind: 'threads',
    hint: 'Filed away. A new reply pulls a thread back to the Inbox.',
  },
]

/**
 * Machine mail, kept out of the Inbox and given routes of its own.
 *
 * DMARC aggregates arrive daily from every receiver with an opinion and nothing
 * marks them read; bounces are machine reports. Neither should bury a
 * prospect's reply — see src/mailbox/domain/mailboxes.js.
 */
export const MACHINE_FOLDERS = [
  {
    key: 'bounces',
    label: 'Bounces',
    kind: 'threads',
    hint: 'Delivery reports. Only a bounce matched by an identifier we issued may suppress an address.',
  },
  {
    key: 'dmarc',
    label: 'DMARC reports',
    kind: 'threads',
    hint: 'Aggregate XML from receiving providers. Stored, not parsed.',
  },
]

/** Every navigable section, including the one that is not a folder. */
export const DIAGNOSTICS_SECTION = { key: 'diagnostics', label: 'Diagnostics', kind: 'diagnostics', hint: '' }

const ALL_SECTIONS = [...FOLDERS, ...MACHINE_FOLDERS, DIAGNOSTICS_SECTION]

export const SECTION_KEYS = ALL_SECTIONS.map((section) => section.key)

/** @param {string} key */
export function sectionFor(key) {
  return ALL_SECTIONS.find((section) => section.key === key) ?? FOLDERS[0]
}

/**
 * THE single active-section resolver.
 *
 * Every navigation item derives its highlight from this one value, so exactly
 * one can ever be active. Legacy `?mailbox=bounce` / `?mailbox=dmarc` URLs are
 * still understood here — bookmarks and anything already linked keep working
 * and resolve to the same section their dedicated route does.
 *
 * @param {{ pathname: string, search?: string|URLSearchParams }} location
 * @returns {string} one of SECTION_KEYS
 */
export function resolveMailboxSection({ pathname, search }) {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(String(search ?? '').replace(/^\?/, ''))

  const segment = String(pathname ?? '')
    .replace(/\/+$/, '')
    .split('/')
    .pop()

  if (SECTION_KEYS.includes(segment) && segment !== 'mailbox') {
    // A dedicated machine route wins outright; the old query form cannot then
    // contradict it.
    if (segment === 'inbox') {
      const legacy = params.get('mailbox')
      if (legacy === 'bounce') return 'bounces'
      if (legacy === 'dmarc') return 'dmarc'
    }
    return segment
  }

  // Bare /admin/mailbox, or anything unrecognised, is the Inbox — a stale
  // bookmark should land somewhere real rather than on an empty screen.
  const legacy = params.get('mailbox')
  if (legacy === 'bounce') return 'bounces'
  if (legacy === 'dmarc') return 'dmarc'
  return 'inbox'
}

export const OUTBOUND_STATUS_TONES = {
  draft: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-100 text-amber-800',
  collected: 'bg-amber-100 text-amber-900',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-400',
}
