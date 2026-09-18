/**
 * Normalizes Zoho's message shapes into the engine's own.
 *
 * Isolated from the sync service so the field-name archaeology lives in one
 * place: Zoho returns different key spellings between the list endpoint and the
 * content endpoint, and between API versions, and every one of those readings
 * has to be attempted or a working integration looks broken.
 */

import { ZOHO } from '../config/defaults.js'
import { normalizeEmail } from '../domain/domains.js'

/** Reads the first key that is present, so a renamed field does not break the sync. */
function firstOf(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

/**
 * Parses a Zoho timestamp into an ISO string.
 *
 * Zoho returns epoch milliseconds as a STRING in most fields and occasionally a
 * formatted date. Both are handled; an unparseable value returns null rather
 * than `Invalid Date`, which would otherwise be written into the database as
 * the literal string "Invalid Date".
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseZohoTimestamp(value) {
  if (value === undefined || value === null || value === '') return null

  const asNumber = Number(value)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    // Epoch seconds vs milliseconds: anything below this threshold is seconds,
    // which would otherwise land in 1970.
    const ms = asNumber < 1e11 ? asNumber * 1000 : asNumber
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Splits a Zoho address field into normalized addresses.
 *
 * Zoho returns comma-separated lists, sometimes with display names
 * (`Jane Doe <jane@acme.com>, info@acme.com`). Splitting on commas alone would
 * break a display name containing one, so this splits on commas that are not
 * inside quotes or angle brackets.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseAddressList(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return []

  const parts = []
  let current = ''
  let inQuotes = false
  let inAngle = false

  for (const character of raw) {
    if (character === '"') inQuotes = !inQuotes
    else if (character === '<') inAngle = true
    else if (character === '>') inAngle = false

    if (character === ',' && !inQuotes && !inAngle) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)

  return [...new Set(parts.map(normalizeEmail).filter(Boolean))]
}

/** Extracts a display name from `Jane Doe <jane@acme.com>`, if present. */
export function parseDisplayName(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
  return match ? match[1].trim().slice(0, 200) : null
}

/**
 * Strips HTML and quoted history from a message body.
 *
 * Quoted history is removed because the conversation view already holds every
 * previous message, and a model asked to analyse a reply will otherwise spend
 * its context on our own earlier email — and sometimes answer THAT instead of
 * the new message.
 *
 * @param {unknown} html
 * @returns {{ text: string, truncated: boolean }}
 */
export function extractPlainBody(html) {
  const source = String(html ?? '')

  const text = source
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const withoutQuotes = stripQuotedHistory(text)
  return {
    text: withoutQuotes.slice(0, ZOHO.maxBodyChars),
    truncated: withoutQuotes.length > ZOHO.maxBodyChars,
  }
}

/**
 * Removes the quoted portion of a reply.
 *
 * Cuts at the first recognized reply separator. Conservative: if the cut would
 * leave nothing, the original is kept — a top-posted reply whose separator
 * happens to appear in the first line is better analysed in full than analysed
 * as an empty string.
 *
 * @param {string} text
 */
export function stripQuotedHistory(text) {
  const SEPARATORS = [
    /^On .{3,120}\bwrote:\s*$/m,
    /^-{2,}\s*Original Message\s*-{2,}$/im,
    /^_{5,}$/m,
    /^From:\s*.+$/m,
    /^Sent from my \w+/m,
    /^>{1,}\s/m,
  ]

  let cutIndex = text.length
  for (const separator of SEPARATORS) {
    const match = text.match(separator)
    if (match && match.index !== undefined && match.index < cutIndex) cutIndex = match.index
  }

  const trimmed = text.slice(0, cutIndex).trim()
  return trimmed.length > 0 ? trimmed : text
}

/**
 * Turns a Zoho list-endpoint entry into the engine's message shape.
 *
 * Body is absent at this stage: the list endpoint returns headers only, and the
 * body is fetched separately and ONLY for messages that matched a known
 * contact — the engine does not read the content of unrelated mail.
 *
 * @param {object} entry
 * @param {'inbox'|'sent'} folder
 */
export function normalizeZohoMessage(entry, folder) {
  const providerMessageId = firstOf(entry, ['messageId', 'msgId', 'messageID'])
  const timestamp = parseZohoTimestamp(
    firstOf(entry, folder === 'sent' ? ['sentDateInGMT', 'sentTime', 'receivedTime'] : ['receivedTime', 'sentDateInGMT']),
  )

  const fromRaw = firstOf(entry, ['fromAddress', 'sender', 'from'])
  const toRaw = firstOf(entry, ['toAddress', 'to'])

  return {
    providerMessageId: providerMessageId ? String(providerMessageId) : null,
    providerThreadId: firstOf(entry, ['threadId', 'conversationId']) ? String(firstOf(entry, ['threadId', 'conversationId'])) : null,
    providerFolder: folder,
    direction: folder === 'sent' ? 'outbound' : 'inbound',
    internetMessageId: firstOf(entry, ['internetMessageId', 'messageIdHeader']),
    inReplyTo: firstOf(entry, ['inReplyTo']),
    references: firstOf(entry, ['references']),
    fromAddress: normalizeEmail(fromRaw) || String(fromRaw ?? '').toLowerCase(),
    fromName: parseDisplayName(fromRaw) || firstOf(entry, ['fromName', 'senderName']),
    toAddresses: parseAddressList(toRaw),
    ccAddresses: parseAddressList(firstOf(entry, ['ccAddress', 'cc'])),
    subject: String(firstOf(entry, ['subject']) ?? '').slice(0, 500),
    timestamp,
    receivedAt: folder === 'inbox' ? timestamp : null,
    sentAt: folder === 'sent' ? timestamp : null,
    hasAttachment: Boolean(firstOf(entry, ['hasAttachment'])),
  }
}
