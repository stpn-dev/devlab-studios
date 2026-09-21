/**
 * Attachment filenames, which are attacker-controlled strings.
 *
 * NOTHING HERE DERIVES A STORAGE LOCATION. R2 keys are built from generated ids
 * in config.js, never from a filename, so traversal is structurally impossible
 * rather than filtered out. This function exists for the two places a name is
 * still used: the `Content-Disposition` of a download, and what the operator
 * reads in the UI.
 *
 * Both are real exposure. A name containing CR or LF splits the header. A name
 * containing a quote escapes the quoted string the filename sits inside. A
 * right-to-left override character makes `invoice[U+202E]exe.pdf` render as
 * `invoicefdp.exe` — a twenty-year-old trick that still works in most file
 * managers.
 */

/** Names Windows refuses regardless of extension. */
const RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])

const MAX_LENGTH = 120

/**
 * Makes a filename safe to put in a header and to show to a person.
 *
 * @param {string|null} input
 * @param {{ fallback?: string }} [options]
 * @returns {string}
 */
export function sanitizeFilename(input, options = {}) {
  const fallback = options.fallback ?? 'attachment'

  let name = String(input ?? '')
    // Bidirectional overrides and zero-width characters, which exist in a
    // filename for exactly one reason.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    // Control characters, including the CR/LF that would split a header.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')

  // Take the last segment, so `../../etc/passwd` and `C:\Windows\x.dll` reduce
  // to their basename. Belt and braces: no key is built from this anyway.
  const segments = name.split(/[/\\]/)
  name = segments[segments.length - 1] ?? ''

  name = name
    // Characters that are illegal on Windows or that quote-escape a header.
    .replace(/["*:<>?|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot hides the file on Unix; trailing dots and spaces are
    // silently stripped by Windows, which makes the stored and displayed names
    // disagree.
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')

  if (!name) return fallback

  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''

  if (RESERVED.has(stem.toLowerCase())) return `${fallback}-${name}`

  if (name.length <= MAX_LENGTH) return name

  // Truncate the stem, never the extension — a name cut mid-extension is both
  // unopenable and misleading about what it is.
  const room = Math.max(1, MAX_LENGTH - extension.length)
  return `${stem.slice(0, room)}${extension}`
}

/**
 * Content types we are willing to state back to the browser.
 *
 * Everything else is served as `application/octet-stream`, which downloads
 * rather than renders. The dangerous case is `text/html`: served with its own
 * type from a domain the operator is signed in to, an emailed HTML attachment
 * would run script in that origin. The R2 object's stored type is never
 * trusted for this — only this allowlist decides.
 */
const SAFE_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'text/plain', 'text/csv',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/gzip',
  'message/rfc822',
])

/**
 * The content type to serve an attachment with.
 *
 * Parameters are dropped: a `charset` or `boundary` copied from a hostile
 * message has no business in a response header.
 *
 * @param {string|null} input
 * @returns {string}
 */
export function safeContentType(input) {
  const type = String(input ?? '').split(';')[0].trim().toLowerCase()
  if (!type) return 'application/octet-stream'
  return SAFE_CONTENT_TYPES.has(type) ? type : 'application/octet-stream'
}

/**
 * A `Content-Disposition` value that cannot escape its own quoting.
 *
 * RFC 6266: the ASCII `filename` is the fallback, `filename*` carries the real
 * UTF-8 name. Emitting only the first loses non-Latin names entirely; emitting
 * only the second breaks older clients.
 *
 * @param {string} filename already through sanitizeFilename
 * @returns {string}
 */
export function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
