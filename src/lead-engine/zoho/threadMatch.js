/**
 * Matching a mailbox message to a CRM conversation.
 *
 * Strong identifiers first, heuristics only as a last resort. The ordering is
 * the whole design:
 *
 *   1. The provider's own thread id, when it exposes one.
 *   2. RFC 5322 `In-Reply-To` / `References` against message ids we stored.
 *   3. A known contact address, plus time proximity.
 *   4. Nothing — the message is not ours and is left alone.
 *
 * Subject matching NEVER decides a match on its own. Two prospects can both
 * reply "Re: Quick question about your intake process" to two different
 * threads, and attributing one business's reply to another business's lead is
 * the worst failure this module can produce — it would put a stranger's words
 * on a lead record and then generate a reply that quotes them.
 */

import { normalizeEmail } from '../domain/domains.js'

/** How long after an outbound message an unlinked inbound reply can still be attributed to it. */
const TIME_PROXIMITY_DAYS = 45

/**
 * Parses a References header into individual message ids.
 *
 * The header is whitespace-separated angle-bracketed ids, but real-world mail
 * puts commas, newlines and stray text in it, so this extracts the bracketed
 * forms rather than splitting.
 *
 * @param {string|null|undefined} header
 * @returns {string[]}
 */
export function parseMessageIdList(header) {
  const matches = String(header ?? '').match(/<[^<>\s]+>/g) || []
  return [...new Set(matches.map((id) => id.trim()))]
}

/**
 * Normalizes a single Message-ID for comparison.
 *
 * Kept WITH its angle brackets, because that is how mail systems write them and
 * stripping them in one place and not another is how two spellings of the same
 * id stop matching.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeMessageId(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const bracketed = raw.match(/<[^<>\s]+>/)
  if (bracketed) return bracketed[0]
  return raw.includes('@') ? `<${raw}>` : null
}

/**
 * Picks the counterpart address for a message.
 *
 * For an inbound message that is the sender; for an outbound one it is the
 * recipient. Both are compared against known CRM contacts, which is what lets
 * the Sent-folder sync recognize a message the operator wrote by hand.
 *
 * @param {{ direction: string, fromAddress?: string, toAddresses?: string[] }} message
 * @param {string} mailboxAddress our own address, excluded from consideration
 * @returns {string[]}
 */
export function counterpartAddresses(message, mailboxAddress) {
  const ours = normalizeEmail(mailboxAddress)

  const candidates =
    message.direction === 'inbound'
      ? [message.fromAddress]
      : [...(message.toAddresses || []), ...(message.ccAddresses || [])]

  return [...new Set(candidates.map(normalizeEmail).filter((address) => address && address !== ours))]
}

/**
 * Resolves a mailbox message to a CRM conversation.
 *
 * Pure: every lookup is injected, so the matching logic is exhaustively
 * testable without a database.
 *
 * @param {{
 *   message: { direction, providerThreadId?, internetMessageId?, inReplyTo?, references?,
 *              fromAddress?, toAddresses?, ccAddresses?, subject?, timestamp? },
 *   mailboxAddress: string,
 *   findConversationByThreadId: (threadId: string) => Promise<object|null>,
 *   findConversationByMessageIds: (ids: string[]) => Promise<object|null>,
 *   findContactsByEmail: (email: string) => Promise<Array<object>>,
 *   findConversationForLead: (leadId: string) => Promise<object|null>
 * }} input
 * @returns {Promise<{
 *   matched: boolean, conversation: object|null, leadId: string|null,
 *   contactId: string|null, strategy: string
 * }>}
 */
export async function matchMessageToConversation(input) {
  const { message, mailboxAddress } = input
  const none = { matched: false, conversation: null, leadId: null, contactId: null, strategy: 'no_match' }

  // 1. Provider thread id.
  if (message.providerThreadId) {
    const conversation = await input.findConversationByThreadId(message.providerThreadId)
    if (conversation) {
      return {
        matched: true,
        conversation,
        leadId: conversation.leadId,
        contactId: conversation.contactId ?? null,
        strategy: 'provider_thread_id',
      }
    }
  }

  // 2. RFC 5322 headers. In-Reply-To is the direct parent; References carries
  // the whole ancestry, which still matches when a client drops In-Reply-To.
  const referencedIds = [
    normalizeMessageId(message.inReplyTo),
    ...parseMessageIdList(message.references),
  ].filter(Boolean)

  if (referencedIds.length > 0) {
    const conversation = await input.findConversationByMessageIds(referencedIds)
    if (conversation) {
      return {
        matched: true,
        conversation,
        leadId: conversation.leadId,
        contactId: conversation.contactId ?? null,
        strategy: 'message_id_headers',
      }
    }
  }

  // 3. Known contact address. This is the fallback that makes manual sends
  // detectable: an operator composing a fresh message in Zoho produces no
  // thread we have seen, but the recipient is a contact we recorded.
  for (const address of counterpartAddresses(message, mailboxAddress)) {
    const contacts = await input.findContactsByEmail(address)
    if (contacts.length === 0) continue

    // Most recently updated lead first — the same address can legitimately
    // appear on two leads (two campaigns, one business), and the active one is
    // where a message almost certainly belongs. `findContactsByEmail` already
    // orders this way.
    const contact = contacts[0]
    const conversation = await input.findConversationForLead(contact.leadId)

    if (conversation && !withinTimeProximity(message.timestamp, conversation.lastMessageAt)) {
      // A contact match on a conversation that has been silent for months is
      // weak evidence. Reported as matched-but-stale so the caller can attach
      // it to the lead while flagging it for a human.
      return {
        matched: true,
        conversation,
        leadId: contact.leadId,
        contactId: contact.id,
        strategy: 'contact_address_stale',
      }
    }

    return {
      matched: true,
      conversation: conversation ?? null,
      leadId: contact.leadId,
      contactId: contact.id,
      strategy: 'contact_address',
    }
  }

  return none
}

/**
 * Whether two timestamps are close enough for a contact-address match to be
 * treated as current.
 *
 * Returns true when either timestamp is missing: an absent timestamp is not
 * evidence of staleness, and treating it as such would flag every
 * freshly-created conversation.
 *
 * @param {string|number|null|undefined} messageTime
 * @param {string|number|null|undefined} conversationTime
 */
export function withinTimeProximity(messageTime, conversationTime, days = TIME_PROXIMITY_DAYS) {
  if (!messageTime || !conversationTime) return true

  const a = new Date(messageTime).getTime()
  const b = new Date(conversationTime).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true

  return Math.abs(a - b) <= days * 24 * 60 * 60 * 1000
}
