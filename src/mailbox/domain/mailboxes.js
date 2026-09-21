/**
 * Which address received a message, and what that means.
 *
 * `mailbox_messages.mailbox` and `mailbox_threads.mailbox` have NO CHECK
 * constraint, and this file is the reason. Three times in this schema a CHECK
 * plus `INSERT OR IGNORE` has silently discarded a row (lead_usage_daily.metric,
 * lead_sources.type, lead_suppression.source). The set of addresses a domain
 * answers is exactly the kind of set that grows — abuse@, a per-campaign
 * address, a second product later — so it is enforced here, by code that
 * throws, the same way `lead_activity.event_type` is enforced by
 * domain/activity.js.
 *
 * src/mailbox/schema.test.js asserts this vocabulary and the migration agree.
 */

import { MAIL_DOMAIN } from '../config.js'

export const MAILBOX = Object.freeze({
  /** The human inbox. Replies from prospects land here. */
  HELLO: 'hello',
  /** VERP bounce address. Delivery Status Notifications land here. */
  BOUNCE: 'bounce',
  /** DMARC aggregate reports. Never shown in the human inbox — see below. */
  DMARC: 'dmarc',
  /** RFC 2142 requires a domain that sends mail to answer these. */
  POSTMASTER: 'postmaster',
  ABUSE: 'abuse',
  /**
   * Anything else the catch-all picked up. Kept rather than dropped: a
   * misaddressed reply from a real prospect is worth more than a tidy inbox,
   * and a catch-all that discards is indistinguishable from a broken MX.
   */
  OTHER: 'other',
})

export const ALL_MAILBOXES = Object.freeze(Object.values(MAILBOX))

/** @param {string} value */
export function isValidMailbox(value) {
  return ALL_MAILBOXES.includes(value)
}

/**
 * Mailboxes a person is expected to read, in the order the UI lists them.
 *
 * DMARC is excluded on purpose. Aggregate reports arrive daily from every
 * receiver that has an opinion, as gzipped XML, and they are machine output —
 * putting them in the inbox would bury a prospect's reply under a week of
 * Google and Microsoft telemetry. They are stored and readable on their own
 * screen.
 */
export const HUMAN_MAILBOXES = Object.freeze([
  MAILBOX.HELLO,
  MAILBOX.POSTMASTER,
  MAILBOX.ABUSE,
  MAILBOX.OTHER,
])

export const MAILBOX_LABELS = Object.freeze({
  [MAILBOX.HELLO]: 'Inbox',
  [MAILBOX.BOUNCE]: 'Bounces',
  [MAILBOX.DMARC]: 'DMARC reports',
  [MAILBOX.POSTMASTER]: 'Postmaster',
  [MAILBOX.ABUSE]: 'Abuse',
  [MAILBOX.OTHER]: 'Unrouted',
})

/**
 * Splits an address into its local part, subaddress tag and domain.
 *
 * `bounce+d-abc123@devlabconnect.com` -> { local: 'bounce', tag: 'd-abc123' }.
 *
 * The separator is `+` only. Some providers also treat `-` as a subaddress
 * separator; doing that here would turn a legitimate local part like
 * `sales-team` into a tagged `sales`, which is how a real address stops being
 * deliverable.
 *
 * @param {string} address
 * @returns {{ local: string, tag: string|null, domain: string }|null}
 */
export function splitAddress(address) {
  const raw = String(address ?? '').trim().toLowerCase()
  if (!raw) return null

  const at = raw.lastIndexOf('@')
  if (at <= 0 || at === raw.length - 1) return null

  const localPart = raw.slice(0, at)
  const domain = raw.slice(at + 1)

  const plus = localPart.indexOf('+')
  if (plus === -1) return { local: localPart, tag: null, domain }

  return {
    local: localPart.slice(0, plus),
    // An empty tag (`bounce+@`) is not a tag.
    tag: localPart.slice(plus + 1) || null,
    domain,
  }
}

/**
 * Which mailbox an envelope recipient belongs to.
 *
 * Driven by the envelope RCPT TO (`message.to`), never by the `To:` header. A
 * message Bcc'd to us has a header that does not mention us at all, and a
 * mailing list rewrites the header freely — the envelope is the only field that
 * says where the message was actually delivered.
 *
 * @param {string} envelopeTo
 * @returns {string} one of MAILBOX
 */
export function mailboxForRecipient(envelopeTo) {
  const parts = splitAddress(envelopeTo)
  if (!parts) return MAILBOX.OTHER

  switch (parts.local) {
    case 'hello':
      return MAILBOX.HELLO
    case 'bounce':
    case 'bounces':
      return MAILBOX.BOUNCE
    case 'dmarc':
    case 'dmarc-reports':
      return MAILBOX.DMARC
    case 'postmaster':
      return MAILBOX.POSTMASTER
    case 'abuse':
      return MAILBOX.ABUSE
    default:
      return MAILBOX.OTHER
  }
}

/**
 * The VERP return path for one outbound message.
 *
 * `bounce+<kind>-<id>@devlabconnect.com`. The one-letter kind is what makes a
 * single bounce address serve two different senders — `d` for a lead-engine
 * outreach draft, `o` for a mailbox reply — without the reader having to guess
 * at the shape of what it found. The kinds are the same ones
 * domain/messageId.js encodes, so both correlation routes speak one vocabulary.
 *
 * Cloudflare Email Routing matches `bounce+anything@` against a rule for
 * `bounce@` when subaddressing is on, so this needs no catch-all to work — but
 * the deployment uses a catch-all anyway, because a bounce that arrives at an
 * address no rule matches is the one bounce you most needed to see.
 *
 * @param {string} kind single lowercase letter
 * @param {string} id
 * @returns {string}
 */
export function verpAddress(kind, id) {
  const safeKind = /^[a-z]$/.test(String(kind)) ? String(kind) : 'x'
  const clean = String(id ?? '').replace(/[^A-Za-z0-9-]/g, '')
  if (!clean) return `bounce@${MAIL_DOMAIN}`
  return `bounce+${safeKind}-${clean}@${MAIL_DOMAIN}`
}

/** @param {string} draftId */
export function verpAddressForDraft(draftId) {
  return verpAddress('d', draftId)
}

/**
 * Reads our identifier back out of a VERP recipient.
 *
 * @param {string} envelopeTo
 * @returns {{ kind: string, id: string }|null}
 */
export function verpIdentity(envelopeTo) {
  const parts = splitAddress(envelopeTo)
  if (!parts || !parts.tag) return null
  if (parts.local !== 'bounce' && parts.local !== 'bounces') return null

  const match = /^([a-z])-([A-Za-z0-9-]{8,64})$/.exec(parts.tag)
  return match ? { kind: match[1], id: match[2] } : null
}

/**
 * Reads a draft id back out of a VERP recipient.
 *
 * @param {string} envelopeTo
 * @returns {string|null}
 */
export function draftIdFromVerp(envelopeTo) {
  const identity = verpIdentity(envelopeTo)
  return identity?.kind === 'd' ? identity.id : null
}
