/**
 * The folder model behind the mailbox screens.
 *
 * Separated from the components because a module exporting both defeats React
 * Fast Refresh, which this project's lint config enforces — the same reason
 * lead-crm/format.js is split from lead-crm/shared.jsx.
 *
 * THE FOLDER NAMES ARE THE ONES PEOPLE ALREADY KNOW, and each maps onto a real
 * distinction in the data rather than being a label over the same list:
 *
 *   Inbox    — what arrived and has not been filed
 *   Drafts   — written, never handed over. Editable, deletable
 *   Outbox   — handed over, NOT yet confirmed transmitted
 *   Sent     — confirmed on the wire by the transmitter
 *   Archive  — filed away; still searchable, out of the inbox
 *
 * The Outbox/Sent split is the one worth keeping honest. Every other mail
 * client shows a message as sent the moment you press the button; here the
 * transmitter is a separate system that may not have run yet, so a reply sits
 * in Outbox until it calls back. Folding the two together would tell the
 * operator a prospect had been answered when nothing had left the building.
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

export const FOLDER_KEYS = FOLDERS.map((folder) => folder.key)

/** @param {string} key */
export function folderFor(key) {
  return FOLDERS.find((folder) => folder.key === key) ?? FOLDERS[0]
}

/**
 * The non-human mailboxes, offered as a filter rather than mixed into the Inbox.
 *
 * DMARC aggregates arrive daily from every receiver with an opinion and nothing
 * marks them read; bounces are machine reports. Both are kept out of the
 * default view so a prospect's reply is not buried — see
 * src/mailbox/domain/mailboxes.js.
 */
export const MACHINE_MAILBOXES = [
  { key: 'bounce', label: 'Bounces' },
  { key: 'dmarc', label: 'DMARC reports' },
]

export const OUTBOUND_STATUS_TONES = {
  draft: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-100 text-amber-800',
  collected: 'bg-amber-100 text-amber-900',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-400',
}
