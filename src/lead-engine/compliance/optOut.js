/**
 * Deterministic opt-out detection, and the opt-out line we put in drafts.
 *
 * SCOPE: this is an OPERATIONAL SAFEGUARD with an audit trail, not a legal
 * determination. Detecting "remove me" and suppressing the address is a thing
 * we do because it is right and because it is operationally necessary; it is
 * not a claim that any particular message was lawful. Manual sending is not
 * exempt from this file — a reply asking to be left alone is honoured whether
 * the original message was generated here or typed by a person.
 *
 * DETERMINISTIC ONLY, AND IT RUNS FIRST. `detectOptOut` is pure string matching
 * with no model in the path, and it runs BEFORE any AI step on an inbound
 * message. Its decision CANNOT be reversed by a model: no prompt, no
 * classification and no confidence score anywhere in this system is permitted
 * to turn a detected opt-out back into "keep emailing them". A model that
 * disagreed with this function would still lose, by construction — the only way
 * an opt-out is undone is a human removing the suppression entry, which is an
 * audited, reason-required operation in repositories/suppression.js.
 *
 * WHICH WAY IT FAILS, and why that is the right direction. This check fails
 * SAFE — toward suppressing. A false positive costs one lead: we stop emailing
 * someone who was not actually asking us to, and a person can undo it. A false
 * negative means we keep emailing someone who asked us to stop, which is the
 * precise harm this subsystem exists to prevent, is invisible until it becomes
 * a complaint, and is not undoable. The asymmetry is not close, so the phrase
 * list below leans inclusive and the negation guard below is narrow.
 */

import { ZOHO } from '../config/defaults.js'

/**
 * Detection kinds, most severe first. A message can match several phrases; the
 * kind reported is the most severe match, because "this is spam, unsubscribe
 * me" is a complaint that also happens to contain an unsubscribe request, and
 * recording it as a plain unsubscribe would understate what happened.
 */
export const OPT_OUT_KINDS = Object.freeze(['complaint', 'do_not_contact', 'unsubscribe'])

/** The word we ask people to reply with. Used when building and when matching. */
export const OPT_OUT_KEYWORD = 'STOP'

/**
 * Phrase patterns, grouped by kind and evaluated in OPT_OUT_KINDS order.
 *
 * Imperative and first-person forms are preferred over bare nouns: "unsubscribe
 * me" and "remove me" are requests, whereas the bare word "newsletter" is not.
 * The one bare noun kept is "unsubscribe" itself, because a one-word reply
 * saying exactly that is the single most common way people opt out and any
 * cleverness here would cost more than it saves.
 */
const PATTERNS_BY_KIND = Object.freeze({
  complaint: Object.freeze([
    /\bthis (?:is|was) spam\b/,
    /\b(?:reported|reporting|report(?:ed)? you|marked|marking)\s+(?:this|it|you|your\s+\w+)?\s*as\s+spam\b/,
    /\bspam\s+complaint\b/,
    /\bfiling?\s+a\s+complaint\b/,
  ]),
  do_not_contact: Object.freeze([
    /\bdo\s*n[o']?t\s+(?:ever\s+)?contact\s+(?:me|us|this|anyone)\b/,
    /\bdo\s+not\s+(?:ever\s+)?(?:email|e-mail|message|write\s+to)\s+(?:me|us)\b/,
    /\bnever\s+(?:contact|email|e-mail|message)\s+(?:me|us)\b/,
    /\bstop\s+(?:emailing|e-mailing|contacting|messaging|writing\s+to)\s+(?:me|us)\b/,
    /\bstop\s+sending\s+(?:me|us)\b/,
    /\blose\s+(?:my|our)\s+(?:email|e-mail|address|number|details)\b/,
  ]),
  unsubscribe: Object.freeze([
    /\bunsubscribe\b/,
    /\bopt[\s-]?(?:me\s+)?out\b/,
    /\bremove\s+(?:me|us|this\s+(?:email|e-mail|address))\b/,
    /\btake\s+(?:me|us)\s+off\b/,
    /\bno\s+longer\s+(?:wish|want)\s+to\s+receive\b/,
    /\bplease\s+stop\b/,
  ]),
})

/**
 * Negations that appear immediately before a phrase and invert it.
 *
 * Narrow on purpose. This exists for the one realistic false positive —
 * a prospect writing "I don't want to opt out of the conversation, just slow it
 * down" — and nothing more. Every clause added here is a chance to talk
 * ourselves out of an opt-out that was real, which is the expensive direction,
 * so the guard covers explicit "I do not want to / no need to / not asking to"
 * constructions and stops there. Anything more ambiguous stays detected.
 */
const NEGATION_BEFORE = /(?:do\s*n[o']?t|does\s*n[o']?t|did\s*n[o']?t|no\s+need|not\s+asking|would\s*n[o']?t|rather\s+not|never\s+said)\s+(?:\w+\s+){0,3}$/

/**
 * How much text is preserved before a match when testing for a negation.
 * Long enough for "I really do not want to", short enough that a negation two
 * sentences earlier cannot reach forward and cancel an unrelated request.
 */
const NEGATION_LOOKBEHIND_CHARS = 40

/**
 * Normalizes a message for matching.
 *
 * Quoted lines are dropped. Mail clients prefix the message being replied to
 * with `>`, and our own outreach ends with an opt-out instruction — without
 * this, every reply that quoted us would look like an opt-out request. When a
 * client does not quote with `>`, the instruction stays in the haystack and we
 * over-detect, which is the direction this file is content to fail in.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeForMatching(value) {
  return String(value ?? '')
    .slice(0, ZOHO.maxBodyChars)
    .toLowerCase()
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .replace(/[‘’]/g, "'")
    .replace(/[^\S\n]+/g, ' ')
}

/**
 * True when the text immediately preceding a match negates it.
 *
 * @param {string} haystack
 * @param {number} matchIndex
 */
function isNegated(haystack, matchIndex) {
  const before = haystack.slice(Math.max(0, matchIndex - NEGATION_LOOKBEHIND_CHARS), matchIndex)
  return NEGATION_BEFORE.test(before)
}

/**
 * A bare `STOP` reply — the mechanism we advertise, so it must work.
 *
 * Matched as a whole line rather than as a word, because "stop" inside a
 * sentence usually is not a request ("we had to stop using them"), while a line
 * containing only STOP is unambiguous and is precisely what our own instruction
 * asked for.
 */
const BARE_KEYWORD_LINE = new RegExp(`^\\s*${OPT_OUT_KEYWORD.toLowerCase()}[\\s.!]*$`, 'm')

/**
 * Whether an inbound message is asking us to stop.
 *
 * Runs before any AI step and its result is not reviewable by a model — see the
 * module comment. Subject and body are scanned together because "unsubscribe"
 * in a subject line with an empty body is a complete request.
 *
 * @param {unknown} messageText the reply body as received
 * @param {unknown} [subject]
 * @returns {{ detected: boolean, kind: 'unsubscribe'|'do_not_contact'|'complaint'|null, matchedPhrase: string|null }}
 */
export function detectOptOut(messageText, subject) {
  const haystack = `${normalizeForMatching(subject)}\n${normalizeForMatching(messageText)}`

  for (const kind of OPT_OUT_KINDS) {
    for (const pattern of PATTERNS_BY_KIND[kind]) {
      // `g` so a negated first occurrence does not hide a genuine second one:
      // "I don't want to opt out of the project, but please unsubscribe me"
      // must still be detected.
      const scanner = new RegExp(pattern.source, 'g')
      let match = scanner.exec(haystack)
      while (match) {
        if (!isNegated(haystack, match.index)) {
          return { detected: true, kind, matchedPhrase: match[0].trim() }
        }
        match = scanner.exec(haystack)
      }
    }
  }

  const bare = BARE_KEYWORD_LINE.exec(haystack)
  if (bare) return { detected: true, kind: 'unsubscribe', matchedPhrase: OPT_OUT_KEYWORD }

  return { detected: false, kind: null, matchedPhrase: null }
}

/**
 * The plain-text opt-out line appended to outreach drafts.
 *
 * Returns an empty string when no sender address is configured, rather than
 * producing a line that points nowhere. An opt-out route that does not reach
 * anyone is worse than none, because it looks like one; the empty string is
 * what makes the US profile's opt-out check fail and hold the lead until
 * business identity settings are filled in.
 *
 * Reply-with-STOP rather than a hosted unsubscribe link: the reply lands in the
 * same mailbox the outreach came from, it is handled by `detectOptOut` on
 * import, and it works even if every other part of this system is down. The
 * postal address that US outreach also needs is added by the draft composer
 * from the same identity settings — it is not part of this line.
 *
 * @param {{ senderEmail?: string, senderName?: string, legalName?: string }} [businessIdentity]
 * @returns {string}
 */
export function buildUnsubscribeInstruction(businessIdentity) {
  const senderEmail = String(businessIdentity?.senderEmail ?? '').trim()
  if (!senderEmail) return ''

  const sender = String(businessIdentity?.senderName ?? businessIdentity?.legalName ?? '').trim()
  const attribution = sender ? ` ${sender} reads every reply.` : ''

  return `If you would prefer not to hear from us, reply to this email with ${OPT_OUT_KEYWORD} `
    + `and we will not contact you again. You can also write to ${senderEmail}.${attribution}`
}

/**
 * Whether a draft carries a usable opt-out instruction.
 *
 * Deliberately strict: it looks for the reply-with-STOP mechanism, not merely
 * for the word "unsubscribe". A draft that mentions unsubscribing without
 * saying how would pass a looser check while leaving the reader with no route,
 * and strictness fails toward holding a draft for a person — the cheap
 * direction.
 *
 * @param {unknown} body
 * @returns {boolean}
 */
export function messageContainsOptOutInstruction(body) {
  const text = String(body ?? '').slice(0, ZOHO.maxBodyChars).toLowerCase()
  const keyword = OPT_OUT_KEYWORD.toLowerCase()

  return new RegExp(`\\breply\\b(?:[^.\\n]{0,60}?)\\b${keyword}\\b`).test(text)
}
