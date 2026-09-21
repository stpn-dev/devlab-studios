/**
 * Builds the complete message that gets transmitted.
 *
 * WHY THIS APPLICATION BUILDS THE WHOLE RFC 5322 MESSAGE, RATHER THAN HANDING
 * OVER FIELDS FOR THE SENDER TO ASSEMBLE.
 *
 * The original plan was for n8n's built-in Send Email node to compose the
 * reply from `to`/`subject`/`body`. Checked against n8n's own source and
 * documentation, that node cannot do what threaded replies require:
 *
 *   - It exposes exactly seven options — `appendAttribution`, `attachments`,
 *     `fileAttachments`, `ccEmail`, `bccEmail`, `allowUnauthorizedCerts`,
 *     `replyTo` — and hands nodemailer a hard-coded object built only from
 *     those. No custom headers can reach the message.
 *   - n8n's documentation states the limitation outright: the node "does not
 *     support setting headers like `In-Reply-To` and `References`, which are
 *     required for email threading. As a result, each email is treated as a
 *     new conversation."
 *   - It does not expose nodemailer's `envelope`, so `MAIL FROM` is always
 *     derived from the `From:` header — which rules out a per-message VERP
 *     return path through that node.
 *
 * Designing around those limits would have meant shipping replies that do not
 * thread in the recipient's client and bounces that correlate to nothing. So
 * the boundary moved rather than the requirement: this application produces a
 * finished message plus an explicit envelope, and the transmitter's only job is
 * to issue `MAIL FROM`, `RCPT TO` and `DATA`. That also makes the CRM side
 * independent of which transmitter is used — nodemailer's `raw`, a shim, or
 * anything else — which is the property worth having.
 *
 * THIS STILL DOES NOT SEND. It returns a string. Nothing in this repository
 * opens a socket, and the Email Worker cannot originate arbitrary mail either
 * (`reply()` may only answer the message currently being handled, once, and
 * only when it passed DMARC).
 */

import { encodeHeaderValue, formatAddress, formatDate, wrapBody } from '../../lead-engine/mail/eml.js'
import { PRIMARY_ADDRESS } from '../config.js'

/**
 * Removes anything that could inject a second header.
 *
 * A subject or display name that came from an inbound message is
 * attacker-controlled, and a bare CR or LF in it appends headers of the
 * sender's choosing — `Bcc:` being the obvious one. `encodeHeaderValue`
 * already collapses newlines for non-ASCII values, but an ASCII-only value
 * takes the fast path and would pass straight through.
 *
 * @param {string} value
 */
function headerSafe(value) {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
}

/** The line ending every RFC 5322 message uses. */
const CRLF = '\r\n'


/**
 * A boundary that cannot collide with the content it delimits.
 *
 * Random rather than derived: a predictable boundary in a message that quotes
 * attacker-supplied text lets that text end a part early and have the
 * remainder read as headers. 128 bits of randomness, behind a prefix no base64
 * alphabet can produce, means neither the encoded attachments nor the wrapped
 * body can contain it by accident.
 */
function makeBoundary() {
  const random = crypto.getRandomValues(new Uint8Array(16))
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `--=_devlab_${hex}`
}

/**
 * Base64, wrapped to 76 characters as RFC 2045 requires.
 *
 * Encoded in chunks because `String.fromCharCode(...bytes)` on a multi-megabyte
 * attachment exceeds the argument limit — which would fail as a RangeError at
 * send time, long after the operator was told the upload succeeded.
 *
 * @param {Uint8Array} bytes
 */
function base64Lines(bytes) {
  let binary = ''
  const CHUNK = 0x8000
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }

  const encoded = btoa(binary)
  const lines = []
  for (let index = 0; index < encoded.length; index += 76) {
    lines.push(encoded.slice(index, index + 76))
  }
  return lines.join(CRLF)
}

/** `type/subtype` and nothing else. Anything else becomes octet-stream. */
function safeContentType(value) {
  const bare = String(value ?? '').split(';')[0].trim()
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i.test(bare) ? bare.toLowerCase() : 'application/octet-stream'
}

/**
 * The `filename` parameter of a Content-Disposition, safely.
 *
 * Control characters and quotes are stripped first: a CR in a filename appends
 * headers of the sender's choosing, and `Bcc:` is the obvious one to append.
 * A non-ASCII name additionally gets an RFC 2231 `filename*`, because a raw
 * UTF-8 byte in a header is not something every receiver agrees about.
 *
 * @param {string} filename
 */
function filenameParameters(filename) {
  // eslint-disable-next-line no-control-regex
  const cleaned = String(filename ?? '').replace(/[\u0000-\u001F\u007F"\\]/g, '').trim()
  const safe = cleaned || 'attachment.bin'
  const ascii = safe.replace(/[^\u0020-\u007E]/g, '_')

  if (ascii === safe) return `filename="${ascii}"`
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

/**
 * One attachment as a MIME part.
 *
 * @param {{ filename: string, contentType?: string, bytes: Uint8Array }} attachment
 * @param {string} boundary
 */
function attachmentPart(attachment, boundary) {
  const bytes = attachment.bytes instanceof Uint8Array ? attachment.bytes : new Uint8Array(attachment.bytes ?? [])

  return [
    `--${boundary}`,
    `Content-Type: ${safeContentType(attachment.contentType)}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; ${filenameParameters(attachment.filename)}`,
    '',
    base64Lines(bytes),
  ].join(CRLF)
}

/**
 * Assembles a plain-text message.
 *
 * Plain text only, and that is a decision rather than a limitation. A reply to
 * a prospect is correspondence; multipart/alternative would double the size,
 * add a rendering surface, and give a spam filter more to dislike from a domain
 * with no sending history.
 *
 * @param {{
 *   to: { email: string, name?: string|null },
 *   from?: { email: string, name?: string|null },
 *   subject: string,
 *   bodyText: string,
 *   messageId: string,
 *   inReplyTo?: string|null,
 *   references?: string[]|null,
 *   replyTo?: string|null,
 *   date?: Date,
 *   attachments?: Array<{ filename: string, contentType?: string, bytes: Uint8Array }>,
 * }} input
 * @returns {string}
 */
export function buildOutboundMessage(input) {
  const date = input.date instanceof Date ? input.date : new Date()
  const from = input.from?.email ? input.from : { email: PRIMARY_ADDRESS, name: 'DevLab Studios' }

  const headers = [
    `From: ${formatAddress({ email: from.email, name: headerSafe(from.name) })}`,
    `To: ${formatAddress({ email: input.to.email, name: headerSafe(input.to.name) })}`,
    `Subject: ${encodeHeaderValue(headerSafe(input.subject))}`,
    `Date: ${formatDate(date)}`,
    // Generated by us, never left to the transmitter. It is the identifier a
    // DSN echoes back, and it is how the bounce path finds the draft without
    // depending on the envelope sender surviving. See domain/messageId.js.
    `Message-ID: <${input.messageId}>`,
  ]

  if (input.replyTo) headers.push(`Reply-To: ${formatAddress({ email: input.replyTo })}`)

  if (input.inReplyTo) {
    headers.push(`In-Reply-To: <${input.inReplyTo}>`)
  }

  const chain = (input.references ?? []).filter(Boolean)
  if (chain.length > 0) {
    // Folded onto continuation lines: a long References header routinely
    // exceeds the 998-octet line limit, and a receiver that enforces it rejects
    // the message outright.
    headers.push(`References: ${chain.map((id) => `<${id}>`).join('\r\n ')}`)
  }

  headers.push('MIME-Version: 1.0')

  const attachments = (input.attachments ?? []).filter(Boolean)

  if (attachments.length === 0) {
    headers.push('Content-Type: text/plain; charset=utf-8')
    headers.push('Content-Transfer-Encoding: 8bit')
    return `${headers.join(CRLF)}${CRLF}${CRLF}${wrapBody(input.bodyText)}${CRLF}`
  }

  // multipart/mixed rather than /alternative: these parts are a message and its
  // enclosures, not two renderings of the same thing. The body stays text/plain
  // for the reason it always was -- a reply to a prospect is correspondence,
  // and an HTML alternative adds size and a rendering surface for no gain.
  const boundary = makeBoundary()
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

  const parts = [
    [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      wrapBody(input.bodyText),
    ].join(CRLF),
    ...attachments.map((attachment) => attachmentPart(attachment, boundary)),
    `--${boundary}--`,
  ]

  return `${headers.join(CRLF)}${CRLF}${CRLF}${parts.join(CRLF)}${CRLF}`
}

/**
 * The reply subject, adding `Re:` exactly once.
 *
 * `Re: Re: Re:` is what happens when each side prepends without checking, and
 * it is the visible symptom of a thread nobody is tracking properly.
 *
 * @param {string} subject
 */
export function replySubject(subject) {
  const text = headerSafe(subject) || '(no subject)'
  return /^re\s*:/i.test(text) ? text : `Re: ${text}`
}
