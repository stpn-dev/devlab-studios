/**
 * Allowlist for the `style` attribute of an inbound message.
 *
 * WHY CSS IS ALLOWED AT ALL. Stripping every declaration renders a company's
 * mail as unstyled text, which for prospecting correspondence loses real
 * information — which parts the sender emphasised, where one section ends and
 * the next begins, what is signature and what is substance. The sanitizer's job
 * is to make someone else's mail safe to read, not to make it unreadable.
 *
 * WHY IT IS SAFE ENOUGH TO DO SO. The body is rendered inside an iframe with
 * `sandbox=""` and a `default-src 'none'` CSP (see MessageBody.jsx). CSS in
 * there cannot execute script, load a font, or open a socket. Two risks remain,
 * and this module exists for exactly those:
 *
 *   1. `url()` — if `img-src` is ever relaxed (it is, per-message, when the
 *      operator asks to load remote images) a background image becomes a read
 *      receipt that the image toggle did not cover. So `url()` is refused
 *      unconditionally, including every way of spelling it that the CSS
 *      grammar permits: escapes (`\75 rl`), comments (`u/**\/rl`), case, and
 *      whitespace before the paren.
 *   2. Hidden or displaced content — `display:none`, `visibility:hidden`,
 *      `opacity:0`, `font-size:0` and `position` let the rendered message
 *      differ from the message actually sent, which is a phishing primitive.
 *      Refusing them costs nothing today: all CSS is currently stripped, so
 *      nothing is hidden now either.
 *
 * WHY IT IS A SEPARATE FILE. A CSS grammar folded into the HTML tokenizer is
 * how both end up subtly wrong. sanitizeHtml.js decides which ELEMENTS survive;
 * this decides which DECLARATIONS do. They are tested apart.
 */

/**
 * Properties a message may set.
 *
 * Deliberately absent: `position`, `top`/`right`/`bottom`/`left`, `z-index`,
 * `transform`, `animation`, `transition`, `content`, `cursor`, `opacity`,
 * `visibility`, `float`, `overflow`, and every `background` shorthand (which
 * can carry a url() inside an otherwise innocent value).
 */
const ALLOWED_PROPERTIES = new Set([
  'color',
  'background-color',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'text-transform',
  'white-space',
  'vertical-align',
  'direction',
  'list-style-type',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'display',
])

/**
 * `display` values that lay content out. `none` is not among them: it hides.
 */
const ALLOWED_DISPLAY = new Set([
  'block',
  'inline',
  'inline-block',
  'inline-table',
  'table',
  'table-row',
  'table-cell',
  'table-header-group',
  'table-footer-group',
  'table-row-group',
  'list-item',
  'flex',
  'inline-flex',
])

/** The only functions a value may call. Everything else, including calc() and var(), is refused. */
const ALLOWED_FUNCTIONS = /\b(?:rgba?|hsla?)\s*\([^()]*\)/gi

/** Longer than any real declaration; a long one is an attack or a mistake. */
const MAX_DECLARATION_LENGTH = 200

/** More than any real element carries. Bounds the emitted attribute. */
const MAX_DECLARATIONS = 32

/**
 * Whether a value is free of the constructs that let CSS fetch or hide.
 *
 * Checked BEFORE any normalisation, on the raw text, because the point is to
 * refuse obfuscation rather than to see through it. A value containing a
 * backslash or a comment is rejected outright instead of being decoded — the
 * decoder is the part that gets exploited.
 *
 * @param {string} value
 */
function valueIsSafe(value) {
  // A backslash starts a CSS escape: `\75 rl(...)` is `url(...)`. A comment can
  // split any keyword: `u/**/rl(...)`. Neither appears in mail written by a
  // template engine, so both are grounds for refusal rather than decoding.
  if (value.includes('\\')) return false
  if (value.includes('/*') || value.includes('*/')) return false

  // Would let the value close the attribute and re-enter markup. The HTML layer
  // escapes on the way out too; this is the second lock.
  if (value.includes('<') || value.includes('>')) return false
  if (value.includes('"')) return false

  // `@import`, `@media` and friends have no business inside an attribute.
  if (value.includes('@')) return false

  // Remove the functions that ARE allowed, then refuse anything that still
  // wants to call something. That inverts the usual blocklist: url(),
  // expression(), image-set(), -moz-binding() and whatever is invented next all
  // fail the same check, without this file needing to know their names.
  const withoutAllowed = value.replace(ALLOWED_FUNCTIONS, '')
  if (withoutAllowed.includes('(') || withoutAllowed.includes(')')) return false

  return true
}

/**
 * Whether a property/value pair is one we are willing to render.
 *
 * @param {string} property lowercased
 * @param {string} value
 */
function declarationIsAllowed(property, value) {
  if (!ALLOWED_PROPERTIES.has(property)) return false

  const bare = value.replace(/\s*!important\s*$/i, '').trim().toLowerCase()

  if (property === 'display') return ALLOWED_DISPLAY.has(bare)

  // `font-size: 0` renders text invisible as surely as `display: none`, and the
  // same goes for a zero-height box holding content.
  if (property === 'font-size' && /^0(?:[a-z%]*)?$/.test(bare)) return false

  return true
}

/**
 * Sanitizes a `style` attribute into the declarations worth keeping.
 *
 * Returns `null` rather than an empty string when nothing survives, so the
 * caller emits no attribute at all instead of `style=""`.
 *
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function sanitizeStyleAttribute(input) {
  const raw = String(input ?? '')
  if (!raw.trim()) return null

  const kept = []

  for (const part of raw.split(';')) {
    if (kept.length >= MAX_DECLARATIONS) break

    const declaration = part.trim()
    if (!declaration) continue
    if (declaration.length > MAX_DECLARATION_LENGTH) return null

    const colon = declaration.indexOf(':')
    if (colon <= 0) return null

    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (!value) return null

    // An unsafe VALUE fails the whole attribute rather than just its own
    // declaration. A message trying to smuggle a url() is not a message whose
    // remaining styling is worth salvaging, and failing closed here means an
    // obfuscation this file does not recognise cannot ride along beside a
    // declaration that happens to be legal.
    if (!valueIsSafe(value)) return null

    if (!declarationIsAllowed(property, value)) continue

    kept.push(`${property}: ${value}`)
  }

  return kept.length > 0 ? kept.join('; ') : null
}
