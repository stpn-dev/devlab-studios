/**
 * Delivery Status Notifications.
 *
 * A DSN is the only message in this mailbox that has to be understood rather
 * than merely stored. Everything else can sit unread until a person looks; a
 * bounce that is not correlated means the suppression list never learns the
 * address is dead, and every future campaign retries it. That is the mechanism
 * by which a sending domain loses its reputation.
 *
 * THREE THINGS ABOUT DSNs THAT BREAK NAIVE HANDLING:
 *
 *   1. They arrive with an EMPTY envelope sender — `MAIL FROM:<>`. That is
 *      required by RFC 5321 §4.5.5, so that a bounce cannot itself bounce and
 *      start a loop. Any code that treats a missing sender as invalid input
 *      drops every real bounce while passing every test written with ordinary
 *      mail. `mailbox_messages.envelope_from` stores `''` as a meaningful
 *      value for exactly this reason.
 *
 *   2. The machine-readable part is `message/delivery-status`, a sibling of the
 *      human-readable text — not the body. Reading `text` gets you a prose
 *      apology in the recipient's language, not the status code.
 *
 *   3. The status that matters is per-RECIPIENT, and a single DSN may report
 *      several. Each recipient block has its own Action and Status.
 *
 * Hardness comes from the RFC 3463 status class, NOT from the SMTP reply text:
 * 5.x.x is permanent, 4.x.x is transient. Guessing from words like "unknown
 * user" in a Diagnostic-Code means guessing in whatever language the remote
 * MTA chose.
 */

import { normalizeEmail } from '../../lead-engine/domain/domains.js'
import { stripBrackets } from './messageId.js'

/** MIME types that carry the machine-readable report. */
const STATUS_TYPES = new Set(['message/delivery-status', 'message/global-delivery-status'])

/** MIME types that carry the original message or its headers. */
const ORIGINAL_TYPES = new Set([
  'message/rfc822',
  'message/rfc822-headers',
  'message/global',
  'message/global-headers',
  'text/rfc822-headers',
])

/**
 * Local parts that mean "this came from a mail system, not a person".
 *
 * Used only as corroboration. A DSN is identified by its content type and its
 * null sender; this list would otherwise misclassify a human whose address
 * happens to be postmaster@.
 */
const DAEMON_LOCALPARTS = new Set(['mailer-daemon', 'postmaster', 'mail-daemon', 'mailerdaemon', 'double-bounce'])

/**
 * Whether a message is a delivery report.
 *
 * The null envelope sender ALONE is enough. A bounce whose content type we did
 * not recognise still has to be treated as a bounce, because the alternative —
 * filing it as ordinary mail — is the silent failure this whole path exists to
 * prevent.
 *
 * @param {{ envelopeFrom?: string, contentType?: string|null, fromAddress?: string|null }} input
 * @returns {boolean}
 */
export function isDeliveryStatusNotification({ envelopeFrom = '', contentType = null, fromAddress = null }) {
  if (String(envelopeFrom ?? '').trim() === '') return true

  const type = String(contentType ?? '').toLowerCase()
  if (type.includes('multipart/report') && type.includes('delivery-status')) return true
  if (STATUS_TYPES.has(type.split(';')[0].trim())) return true

  const from = normalizeEmail(fromAddress)
  if (from && DAEMON_LOCALPARTS.has(from.slice(0, from.lastIndexOf('@')))) return true

  return false
}

/**
 * Decodes an attachment part's content to text.
 *
 * postal-mime hands back an ArrayBuffer for binary parts and a string when it
 * already decoded one, so both have to be handled — assuming either alone
 * produces `[object ArrayBuffer]` in the diagnostic field, which is exactly the
 * kind of thing that survives review because nothing throws.
 *
 * @param {unknown} content
 * @returns {string}
 */
export function partToText(content) {
  if (typeof content === 'string') return content
  if (content instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: false }).decode(content)
  if (content instanceof ArrayBuffer) return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(content))
  return ''
}

/**
 * Unfolds RFC 5322 continuation lines and returns `key: value` pairs in order.
 *
 * Delivery-status fields are header-shaped but are not headers, and they are
 * folded the same way — a Diagnostic-Code routinely wraps onto three lines.
 * Reading them line by line truncates the diagnostic at the first wrap.
 *
 * @param {string} block
 * @returns {Array<[string, string]>}
 */
export function parseFieldBlock(block) {
  const unfolded = String(block ?? '').replace(/\r?\n[ \t]+/g, ' ')
  const fields = []

  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    fields.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()])
  }

  return fields
}

/**
 * Strips the address type prefix RFC 3464 puts on recipient fields.
 *
 * `Final-Recipient: rfc822; user@example.com` — the `rfc822;` is part of the
 * grammar, and an address extracted without removing it never matches a
 * contact.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function parseDsnAddress(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const semicolon = raw.indexOf(';')
  const address = semicolon === -1 ? raw : raw.slice(semicolon + 1)
  return normalizeEmail(address.replace(/^[<\s]+|[>\s]+$/g, ''))
}

/**
 * Reads the per-recipient reports out of a `message/delivery-status` part.
 *
 * @param {string} text
 * @returns {Array<{ recipient: string|null, action: string|null, status: string|null, diagnostic: string|null, remoteMta: string|null }>}
 */
export function parseDeliveryStatus(text) {
  // Blank line separates the per-message block from each per-recipient block.
  const blocks = String(text ?? '').split(/\r?\n\s*\r?\n/).filter((block) => block.trim())
  const recipients = []

  for (const block of blocks) {
    const fields = new Map(parseFieldBlock(block))
    const recipient =
      parseDsnAddress(fields.get('final-recipient')) ?? parseDsnAddress(fields.get('original-recipient'))
    const action = fields.get('action')?.toLowerCase() ?? null
    const status = fields.get('status') ?? null

    // The per-message block has neither, and skipping it here is what keeps
    // the Reporting-MTA from being read as a failed recipient.
    if (!recipient && !action && !status) continue

    recipients.push({
      recipient,
      action,
      status,
      diagnostic: fields.get('diagnostic-code') ?? null,
      remoteMta: fields.get('remote-mta') ?? null,
    })
  }

  return recipients
}

/**
 * Permanent or transient, from the RFC 3463 status class.
 *
 * Unknown defaults to SOFT. Suppressing an address permanently is not
 * reversible from the bounce path — undoing it is a human decision on the
 * Suppression screen — so an unreadable report must not cost us a prospect.
 * Under-suppressing costs one more retry; over-suppressing is forever.
 *
 * @param {{ status?: string|null, action?: string|null }} report
 * @returns {'hard'|'soft'}
 */
export function bounceKind({ status = null, action = null }) {
  const code = String(status ?? '').trim()
  if (code.startsWith('5.')) return 'hard'
  if (code.startsWith('4.')) return 'soft'

  // No Status field: `failed` is permanent by definition in RFC 3464, while
  // `delayed` is explicitly not.
  const verb = String(action ?? '').toLowerCase()
  if (verb === 'failed') return 'hard'

  return 'soft'
}

/**
 * Pulls the original message's `Message-ID` out of the returned headers.
 *
 * This is the correlation route that does not depend on the envelope sender
 * surviving, so it is the one that has to work. See domain/messageId.js.
 *
 * @param {string} text the `message/rfc822-headers` or `message/rfc822` part
 * @returns {string|null} bracketless
 */
export function originalMessageIdFrom(text) {
  const unfolded = String(text ?? '').replace(/\r?\n[ \t]+/g, ' ')
  const match = /^message-id:\s*(.+)$/im.exec(unfolded)
  return match ? stripBrackets(match[1]) : null
}

/**
 * Everything the bounce path needs, from a parsed message.
 *
 * @param {import('postal-mime').Email} parsed
 * @returns {{
 *   reports: Array<object>,
 *   primary: object|null,
 *   kind: 'hard'|'soft',
 *   originalMessageId: string|null,
 * }}
 */
export function extractDsn(parsed) {
  const attachments = parsed?.attachments ?? []

  let reports = []
  let originalMessageId = null

  for (const part of attachments) {
    const type = String(part?.mimeType ?? '').toLowerCase()

    if (STATUS_TYPES.has(type)) {
      reports = reports.concat(parseDeliveryStatus(partToText(part.content)))
      continue
    }

    if (ORIGINAL_TYPES.has(type) && !originalMessageId) {
      originalMessageId = originalMessageIdFrom(partToText(part.content))
    }
  }

  // Some senders inline the report instead of attaching it as a distinct part,
  // and some MTAs return the original headers in the human-readable text. Both
  // are worth a second look before giving up on correlating a real bounce.
  if (reports.length === 0 && parsed?.text) {
    reports = parseDeliveryStatus(parsed.text).filter((report) => report.recipient || report.status)
  }
  if (!originalMessageId && parsed?.text) {
    originalMessageId = originalMessageIdFrom(parsed.text)
  }

  // The most severe report decides, so a DSN covering two recipients where one
  // hard-bounced is not filed as transient.
  const failed = reports.find((report) => bounceKind(report) === 'hard')
  const primary = failed ?? reports[0] ?? null

  return {
    reports,
    primary,
    kind: primary ? bounceKind(primary) : 'soft',
    originalMessageId,
  }
}
