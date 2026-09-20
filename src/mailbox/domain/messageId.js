/**
 * Message-IDs we generate, and reading our own identifiers back out of them.
 *
 * WHY THE ID IS IN THE MESSAGE-ID AND NOT ONLY IN THE ENVELOPE SENDER.
 *
 * The textbook way to correlate a bounce is VERP: put the identifier in the
 * envelope sender, and the DSN comes back addressed to it. That works, and it
 * is implemented (see mailboxes.js), but it depends on the transmitting agent
 * letting us choose the envelope sender per message. Ours is n8n submitting to
 * Postfix, and the envelope sender is whatever that submission path issues as
 * `MAIL FROM` — which is outside this repository and, on current evidence, not
 * something the n8n mail node exposes.
 *
 * Designing bounce correlation around a capability we do not control would mean
 * the whole DSN path works in testing and silently correlates nothing in
 * production. So the identifier goes somewhere we DO control absolutely: the
 * `Message-ID` header of a message this application builds in full.
 *
 * RFC 3464 requires a DSN to carry the original message's headers (as a
 * `message/rfc822-headers` or `message/rfc822` part), and every real MTA does.
 * So the id comes back either way:
 *
 *   1. VERP recipient   — if the envelope sender survived. Cheapest, exact.
 *   2. Returned headers — our Message-ID inside the DSN body. Works regardless.
 *   3. Final-Recipient  — the address that failed, resolved to its last draft.
 *
 * Three independent routes to the same `recordBounce(draftId)` call. No second
 * bounce state system: the CRM still owns suppression and always has.
 */

import { MAIL_DOMAIN } from '../config.js'

/** Prefix for an id that refers to a lead-engine outreach draft. */
export const KIND_DRAFT = 'd'
/** Prefix for an id that refers to a `mailbox_outbound` row. */
export const KIND_OUTBOUND = 'o'

/** Random suffix, so two messages for the same draft never collide. */
function randomSuffix() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Builds a Message-ID, WITHOUT angle brackets.
 *
 * Stored and compared bracketless throughout; brackets are added only when a
 * header is emitted. Mixing the two conventions is how In-Reply-To matching
 * quietly stops matching.
 *
 * @param {{ kind: string, id: string }} input
 * @returns {string}
 */
export function buildMessageId({ kind, id }) {
  const safeKind = /^[a-z]$/.test(String(kind)) ? String(kind) : 'x'
  const safeId = String(id ?? '').replace(/[^A-Za-z0-9-]/g, '')
  return `m.${safeKind}-${safeId}.${randomSuffix()}@${MAIL_DOMAIN}`
}

/**
 * Reads our own identifier back out of a Message-ID.
 *
 * Returns `null` for anything that is not one of ours — including a
 * well-formed Message-ID from another sender at our own domain, because the
 * `m.` prefix and the shape are both required.
 *
 * @param {string} value with or without angle brackets
 * @returns {{ kind: string, id: string }|null}
 */
export function parseMessageId(value) {
  const bare = stripBrackets(value)
  if (!bare) return null

  const at = bare.lastIndexOf('@')
  if (at <= 0) return null
  if (bare.slice(at + 1).toLowerCase() !== MAIL_DOMAIN) return null

  const match = /^m\.([a-z])-([A-Za-z0-9-]{1,64})\./.exec(bare.slice(0, at))
  if (!match) return null

  return { kind: match[1], id: match[2] }
}

/**
 * Normalizes a Message-ID for storage and comparison.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function stripBrackets(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const inner = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1).trim() : raw
  // A header value that arrived folded, or with a stray comment, is not a
  // usable identifier — better to record none than to record a mangled one
  // that will never match.
  if (!inner || /[\s<>]/.test(inner) || !inner.includes('@')) return null
  return inner
}

/**
 * Splits a `References` header into bracketless ids, oldest first.
 *
 * @param {string|null} value
 * @returns {string[]}
 */
export function parseReferences(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return []

  const found = raw.match(/<[^<>]+>/g)
  // Some senders emit References as bare, whitespace-separated ids with no
  // brackets at all. Falling back to a whitespace split recovers those instead
  // of treating the whole header as one unmatchable token.
  const candidates = found ?? raw.split(/\s+/)

  const ids = []
  for (const candidate of candidates) {
    const id = stripBrackets(candidate)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Builds the `References` header for a reply.
 *
 * RFC 5322 §3.6.4: the parent's References, then the parent's Message-ID. The
 * chain is capped because Cloudflare rejects a reply whose References carries
 * more than 100 entries, and because an unbounded header is how a long thread
 * eventually exceeds the line limits of some receivers. The cap keeps the
 * OLDEST entry — the thread root, which is what most clients group on — and
 * drops from the middle.
 *
 * @param {{ parentReferences?: string|null, parentMessageId?: string|null }} input
 * @returns {string[]} bracketless, oldest first
 */
export function buildReferenceChain({ parentReferences = null, parentMessageId = null }) {
  const chain = parseReferences(parentReferences)

  const parent = stripBrackets(parentMessageId)
  if (parent && !chain.includes(parent)) chain.push(parent)

  const MAX = 50
  if (chain.length <= MAX) return chain

  return [chain[0], ...chain.slice(chain.length - (MAX - 1))]
}
