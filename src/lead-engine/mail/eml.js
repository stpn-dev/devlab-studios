/**
 * Builds an RFC 5322 message file the operator opens in their own mail client.
 *
 * THIS IS THE REPLACEMENT FOR A MAILBOX INTEGRATION, AND THE REASON IS WORTH
 * RECORDING. The engine previously wrote drafts into a Zoho mailbox over its
 * API. That worked, and it got the account blocked: a Cloudflare Worker has no
 * stable egress IP, so every scheduled call arrived from a different country —
 * Milan on the day it was caught — and Zoho reasonably read a token being used
 * from everywhere at once as a compromised account.
 *
 * Switching provider would not have helped. Google flags new sign-in locations
 * at least as hard. The fault was not Zoho's; it was coupling outreach to a
 * personal mailbox at all. Cold-email platforms avoid this by never touching
 * one — they send from their own infrastructure. A system that deliberately
 * does NOT send has a simpler option still: hand the operator a file.
 *
 * So there is no OAuth here, no refresh token, no API call and no secret. The
 * draft is built in the Worker, downloaded by the person who approved it, and
 * opened in whatever client they already use. Nothing an email provider can
 * block, because nothing talks to an email provider.
 *
 * IT STILL DOES NOT SEND. A .eml file is inert: it opens as an unsent draft.
 * The person reads it, edits if they want, and presses Send themselves. That
 * is the same guarantee the Zoho client made by hard-coding `mode: 'draft'`,
 * except here it is guaranteed by the file format rather than by a parameter.
 */

/** Characters that may appear unencoded in a header, per RFC 5322. */
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/

/**
 * Encodes a header value when it contains anything outside printable ASCII.
 *
 * RFC 2047 encoded-words, base64 form. A subject containing an em dash or an
 * accented name is ordinary, and emitting it raw produces a file that renders
 * as mojibake in some clients and is rejected outright by others.
 *
 * @param {string} value
 * @returns {string}
 */
export function encodeHeaderValue(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (PRINTABLE_ASCII.test(text)) return text

  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

/**
 * Formats an address, quoting the display name only when it needs it.
 *
 * @param {{ email: string, name?: string|null }} address
 * @returns {string}
 */
export function formatAddress({ email, name = null }) {
  const cleanEmail = String(email ?? '').replace(/[\r\n<>]/g, '').trim()
  const cleanName = String(name ?? '').replace(/[\r\n]/g, ' ').trim()
  if (!cleanName) return cleanEmail

  const encoded = encodeHeaderValue(cleanName)
  // A display name containing a comma, quote or angle bracket has to be quoted
  // or the address parses as two recipients.
  const needsQuoting = /[",<>:;@\\[\]]/.test(encoded)
  return needsQuoting ? `"${encoded.replace(/(["\\])/g, '\\$1')}" <${cleanEmail}>` : `${encoded} <${cleanEmail}>`
}

/**
 * RFC 5322 date, in English regardless of the runtime's locale.
 *
 * `toUTCString()` is close but emits "GMT" where the spec wants "+0000", and
 * some clients are fussy about it.
 *
 * @param {Date} date
 */
export function formatDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (value) => String(value).padStart(2, '0')

  return (
    `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} +0000`
  )
}

/**
 * Wraps body lines to stay under the RFC's 998-octet hard limit.
 *
 * Wrapping is on whitespace so a long URL is left intact rather than broken
 * into something unclickable — an over-long line is a formatting problem, a
 * broken link is a dead call to action.
 *
 * @param {string} body
 */
function wrapBody(body) {
  const out = []

  for (const line of String(body ?? '').split(/\r?\n/)) {
    if (line.length <= 78) {
      out.push(line)
      continue
    }

    let current = ''
    for (const word of line.split(' ')) {
      if (current && `${current} ${word}`.length > 78) {
        out.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) out.push(current)
  }

  return out.join('\r\n')
}

/**
 * Builds the message file.
 *
 * @param {{
 *   to: { email: string, name?: string|null },
 *   from?: { email: string, name?: string|null }|null,
 *   subject: string,
 *   bodyText: string,
 *   inReplyTo?: string|null,
 *   references?: string[]|null,
 *   date?: Date,
 * }} input
 * @returns {string}
 */
export function buildEmlMessage(input) {
  const date = input.date instanceof Date ? input.date : new Date()
  const headers = []

  // `From` is optional on purpose. Omitted, the operator's client fills in
  // whichever account they open it with, which is usually what they want and
  // avoids the file asserting an identity the mailbox does not have.
  if (input.from?.email) headers.push(`From: ${formatAddress(input.from)}`)

  headers.push(`To: ${formatAddress(input.to)}`)
  headers.push(`Subject: ${encodeHeaderValue(input.subject)}`)
  headers.push(`Date: ${formatDate(date)}`)

  if (input.inReplyTo) {
    const id = String(input.inReplyTo).trim()
    const bracketed = id.startsWith('<') ? id : `<${id}>`
    headers.push(`In-Reply-To: ${bracketed}`)
    // References carries the whole chain when we know it, so the reply threads
    // in the recipient's client rather than arriving as a new conversation.
    const chain = (input.references || []).map((entry) =>
      String(entry).startsWith('<') ? String(entry) : `<${entry}>`,
    )
    if (!chain.includes(bracketed)) chain.push(bracketed)
    headers.push(`References: ${chain.join(' ')}`)
  }

  headers.push('MIME-Version: 1.0')
  headers.push('Content-Type: text/plain; charset=utf-8')
  headers.push('Content-Transfer-Encoding: 8bit')
  // Outlook opens a message carrying this as a composable draft rather than as
  // a received message. Other clients ignore it. Harmless either way, and it
  // removes a step for anyone on Outlook.
  headers.push('X-Unsent: 1')

  return `${headers.join('\r\n')}\r\n\r\n${wrapBody(input.bodyText)}\r\n`
}

/**
 * A filesystem-safe filename for the download.
 *
 * @param {{ subject?: string|null, companyName?: string|null }} input
 * @returns {string}
 */
export function buildEmlFilename({ subject = null, companyName = null }) {
  const base = String(companyName || subject || 'outreach')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase()

  return `${base || 'outreach'}.eml`
}
