/**
 * Deciding which conversation an inbound message belongs to.
 *
 * The ordering matters more than any individual rule, and it is the same
 * ordering the lead engine's conversation matching uses (see
 * docs/lead-engine/conversations.md): identifiers first, heuristics last, and
 * SUBJECT NEVER DECIDES ALONE.
 *
 *   1. An identifier WE generated — a VERP tag or our own Message-ID echoed in
 *      In-Reply-To / References. Exact; no false positives possible.
 *   2. Any Message-ID in References that we have already stored. Handles a
 *      reply to a reply, and a thread that passed through a mailing list.
 *   3. Same correspondent, same mailbox, equivalent subject, recently. A
 *      heuristic, and fenced as one: all four conditions, or no match.
 *   4. A new thread.
 *
 * Rule 3 exists because plenty of real clients reply by composing a new message
 * with `Re:` in the subject and no In-Reply-To at all — Outlook Web has done it
 * for years. Without it those replies each become their own thread. With it
 * unfenced, every "Re: Invoice" from every sender collapses into one.
 */

/**
 * Strips reply and forward prefixes, in the languages we are likely to meet.
 *
 * Applied repeatedly, because `Re: Fwd: Re:` is ordinary. The list is not
 * exhaustive and does not need to be: an unrecognised prefix means two messages
 * fail to match and become separate threads, which is a cosmetic problem. A
 * prefix stripped too eagerly would merge unrelated conversations, which is
 * not — so this errs toward leaving text alone.
 *
 * @param {string|null} subject
 * @returns {string}
 */
export function normalizeSubject(subject) {
  let text = String(subject ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  const PREFIX = /^(re|aw|antw|fwd?|wg|tr|sv|vs|rif|res|enc)\s*(\[\d+\])?\s*:\s*/i

  // Bounded rather than `while (true)`: a crafted subject of ten thousand
  // "Re:" is otherwise a small denial of service on every ingest.
  for (let round = 0; round < 12; round += 1) {
    const next = text.replace(PREFIX, '')
    if (next === text) break
    text = next
  }

  return text.toLowerCase().trim()
}

/**
 * The window in which a subject-and-correspondent match is believable.
 *
 * Thirty days. A prospect replying to last month's email without threading
 * headers is plausible; the same subject from the same address a year later is
 * a new conversation, and merging them would put an unrelated exchange in front
 * of whoever reads it.
 */
export const SUBJECT_MATCH_WINDOW_DAYS = 30

/**
 * Whether a candidate thread is close enough to match on subject.
 *
 * Pure, so the policy is testable without a database. The repository supplies
 * candidates; this decides.
 *
 * @param {{ mailbox: string, correspondent: string, subject: string, lastMessageAt: string|null }} thread
 * @param {{ mailbox: string, correspondent: string, subject: string }} incoming
 * @param {Date} now
 * @returns {boolean}
 */
export function subjectMatches(thread, incoming, now = new Date()) {
  if (!thread || !incoming) return false
  if (thread.mailbox !== incoming.mailbox) return false

  const left = String(thread.correspondent ?? '').toLowerCase()
  const right = String(incoming.correspondent ?? '').toLowerCase()
  if (!left || left !== right) return false

  const subject = normalizeSubject(incoming.subject)
  // An empty subject carries no information, so it cannot be the thing that
  // joins two messages. Without this, every unsubjected message from an address
  // joins the first unsubjected message from that address.
  if (!subject) return false
  if (normalizeSubject(thread.subject) !== subject) return false

  if (!thread.lastMessageAt) return false
  const age = now.getTime() - new Date(thread.lastMessageAt).getTime()
  if (!Number.isFinite(age) || age < 0) return false

  return age <= SUBJECT_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Message-IDs worth looking up for an incoming message, most specific first.
 *
 * In-Reply-To names the direct parent, so it is checked before References —
 * which is ordered oldest first, meaning its LAST entry is the nearest
 * ancestor. Walking References forwards would match the thread root and lose
 * the position within it.
 *
 * @param {{ inReplyTo?: string|null, references?: string[] }} input
 * @returns {string[]}
 */
export function candidateParentIds({ inReplyTo = null, references = [] }) {
  const ordered = []

  if (inReplyTo) ordered.push(inReplyTo)
  for (const id of [...references].reverse()) {
    if (!ordered.includes(id)) ordered.push(id)
  }

  return ordered
}
