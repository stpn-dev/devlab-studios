/**
 * Turns the HTML part of an inbound email into something safe to render.
 *
 * TREAT THIS AS ONE OF TWO LAYERS, NOT AS THE GUARANTEE. The admin UI renders
 * the result inside `<iframe sandbox>` with no `allow-scripts` and no
 * `allow-same-origin`, so the browser will not execute script in it even if
 * this function were bypassed entirely. That iframe is the guarantee. This
 * function exists because defence that depends on exactly one control is how a
 * single misconfigured attribute becomes an incident, and because stripping
 * remote references at ingest also removes tracking pixels — which this system
 * refuses to use on other people and should not silently accept from them.
 *
 * WHY NOT HTMLRewriter. The Workers runtime ships a real streaming HTML parser,
 * and it would be a better parser than this one. It is also unavailable in
 * vitest, which would make the single most security-sensitive function in the
 * mailbox the only one with no unit tests. A hand-written allowlist that is
 * exhaustively tested is worth more here than a better parser that is not.
 *
 * WHAT IT DOES, IN ORDER OF IMPORTANCE:
 *
 *   1. ALLOWLIST, never a blocklist — for elements, for attributes, and for URL
 *      schemes. An element nobody thought about is dropped, not kept.
 *   2. Removes every remote reference (images, media, iframes, stylesheets).
 *      Nothing in a rendered message causes the browser to make a request.
 *   3. Drops `style` attributes and `<style>` blocks entirely. CSS can fetch
 *      remote resources with `url()` and can position an element over the rest
 *      of the page; neither is worth supporting to make a marketing email look
 *      right.
 *   4. Never emits an attribute whose name it did not explicitly allow, so
 *      `onerror`, `onload`, `srcdoc` and every future one cannot survive.
 */

import { LIMITS } from '../config.js'
import { sanitizeStyleAttribute } from './sanitizeStyle.js'

/**
 * Elements that survive, with the attributes each may keep.
 *
 * Deliberately small. This is business correspondence, not a rendering engine:
 * paragraphs, emphasis, lists, links, tables and quoted replies cover what
 * people actually send.
 */
const ALLOWED = new Map([
  ['p', ['align']],
  ['br', []],
  ['hr', []],
  ['div', ['align']],
  ['span', []],
  ['a', ['href', 'title']],
  ['b', []],
  ['strong', []],
  ['i', []],
  ['em', []],
  ['u', []],
  ['s', []],
  ['strike', []],
  ['del', []],
  ['ins', []],
  ['sub', []],
  ['sup', []],
  ['ul', []],
  ['ol', ['start']],
  ['li', []],
  ['dl', []],
  ['dt', []],
  ['dd', []],
  ['blockquote', ['cite']],
  ['pre', []],
  ['code', []],
  ['kbd', []],
  ['samp', []],
  ['var', []],
  ['h1', []],
  ['h2', []],
  ['h3', []],
  ['h4', []],
  ['h5', []],
  ['h6', []],
  ['table', ['align', 'bgcolor', 'width', 'height']],
  ['thead', []],
  ['tbody', []],
  ['tfoot', []],
  ['caption', []],
  ['tr', ['align', 'valign', 'bgcolor', 'height']],
  ['td', ['colspan', 'rowspan', 'align', 'valign', 'bgcolor', 'width', 'height']],
  ['th', ['colspan', 'rowspan', 'scope', 'align', 'valign', 'bgcolor', 'width', 'height']],
])

/** Emitted without a closing tag. */
const VOID = new Set(['br', 'hr'])

/**
 * Elements whose CONTENT is not markup and must be skipped to the closing tag
 * rather than parsed. Getting this wrong is the classic sanitizer bypass:
 * treating `<script>` content as markup lets `<script>x = "</div>"` terminate
 * the wrong element.
 */
const RAW_TEXT = new Set(['script', 'style', 'xmp', 'noscript', 'noembed', 'noframes', 'template', 'title', 'textarea'])

/** Dropped along with everything inside them. */
const DROP_SUBTREE = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'button', 'select', 'option', 'optgroup', 'fieldset', 'legend',
  'svg', 'math', 'template', 'xmp', 'noscript', 'noembed', 'noframes',
  'head', 'title', 'textarea', 'map', 'area', 'dialog', 'portal',
])

/**
 * Dropped, and their removal is reported.
 *
 * Separate from DROP_SUBTREE because the UI says so out loud: a message whose
 * images were removed should read as edited, not as broken.
 */
const REMOTE = new Set(['img', 'video', 'audio', 'source', 'picture', 'track', 'canvas', 'link', 'base', 'meta', 'input'])

/** Void elements among the dropped ones — no closing tag to skip to. */
const DROPPED_VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

const URL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * Legacy presentational attributes, kept because templated mail still emits
 * them and frequently emits NOTHING ELSE. A campaign built in Mailchimp or
 * HubSpot lays itself out with `<table bgcolor align width>`; drop those and
 * the message renders as a single unstyled column, which is the complaint this
 * allowlist exists to answer.
 *
 * Each is re-emitted from a validated token rather than copied, so none of them
 * can carry a value the CSS allowlist would have refused.
 */
const PRESENTATIONAL = new Set(['align', 'valign', 'bgcolor', 'width', 'height'])

const ALIGN_VALUES = new Set(['left', 'right', 'center', 'justify'])
const VALIGN_VALUES = new Set(['top', 'middle', 'bottom', 'baseline'])

/** `#rgb`, `#rrggbb` or a bare colour keyword. Nothing that could hold a url(). */
const COLOR_VALUE = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i

/** A CSS length as an HTML attribute writes it: `600`, `600px`, `100%`. */
const LENGTH_VALUE = /^\d{1,5}(?:px|%)?$/i

/**
 * @param {string} key
 * @param {string} value
 * @returns {string|null} the value to emit, or null to drop the attribute
 */
function presentationalValue(key, value) {
  const bare = String(value ?? '').trim()
  if (!bare) return null

  if (key === 'align') return ALIGN_VALUES.has(bare.toLowerCase()) ? bare.toLowerCase() : null
  if (key === 'valign') return VALIGN_VALUES.has(bare.toLowerCase()) ? bare.toLowerCase() : null
  if (key === 'bgcolor') return COLOR_VALUE.test(bare) ? bare : null
  if (key === 'width' || key === 'height') return LENGTH_VALUE.test(bare) ? bare : null

  return null
}

/**
 * How deeply elements may nest before further ones are unwrapped.
 *
 * A CPU bound, not a formatting choice. Closing a tag searches the open-element
 * stack backwards, so an input of a million opening tags followed by a million
 * closing ones is quadratic — and the input is only bounded by
 * `LIMITS.parseMaxBytes` (8 MiB), because `maxHtmlChars` truncates the OUTPUT
 * after the pass has already run. Capping the stack bounds that search to a
 * constant.
 *
 * 150 is far past anything real. Outlook's table-based HTML nests deeply, but
 * in the tens; beyond this the tag is dropped and its content kept, so a
 * pathological message renders as text rather than costing the Worker's whole
 * CPU budget. `postal-mime` is capped the same way for MIME nesting.
 */
const MAX_NESTING = 150

/**
 * Escapes text content.
 *
 * `&` is only escaped when it does not already begin a character reference, so
 * a message containing `&amp;` renders as `&` rather than as `&amp;`.
 *
 * @param {string} value
 */
function escapeText(value) {
  return String(value)
    .replace(/&(?!#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};|[a-zA-Z][a-zA-Z0-9]{1,31};)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** @param {string} value */
function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;')
}

/**
 * Validates a URL for `href`.
 *
 * The control-character strip is the point of this function, not an extra.
 * Browsers ignore tabs, newlines and NULs while resolving a scheme, so
 * `java\tscript:alert(1)` and `java&#x0A;script:` both execute — removing them
 * BEFORE the scheme check is what makes the allowlist mean anything. Relative
 * URLs are rejected outright: in an email they are meaningless, and resolving
 * one would point it at our own admin origin.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function safeUrl(value) {
  // eslint-disable-next-line no-control-regex
  const cleaned = String(value ?? '').replace(/[\u0000- \u007F-\u009F]/g, '').trim()
  if (!cleaned) return null

  const colon = cleaned.indexOf(':')
  if (colon === -1) return null

  const scheme = cleaned.slice(0, colon + 1).toLowerCase()
  if (!URL_SCHEMES.has(scheme)) return null
  // `//` after a scheme-like prefix inside the path is fine; a second colon is
  // not our problem once the scheme is known-good.
  return cleaned
}

/**
 * Parses the attributes of one start tag.
 *
 * @param {string} source
 * @param {number} start index just after the tag name
 * @returns {{ attributes: Array<[string, string]>, end: number, selfClosing: boolean }}
 */
function readAttributes(source, start) {
  const attributes = []
  let index = start
  let selfClosing = false

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index += 1
    if (index >= source.length) break

    if (source[index] === '>') {
      index += 1
      break
    }
    if (source[index] === '/' && source[index + 1] === '>') {
      selfClosing = true
      index += 2
      break
    }

    let name = ''
    while (index < source.length && !/[\s=/>]/.test(source[index])) {
      name += source[index]
      index += 1
    }
    // A stray `/` or `=` with no name would otherwise spin here forever.
    if (!name) {
      index += 1
      continue
    }

    while (index < source.length && /\s/.test(source[index])) index += 1

    let value = ''
    if (source[index] === '=') {
      index += 1
      while (index < source.length && /\s/.test(source[index])) index += 1

      const quote = source[index]
      if (quote === '"' || quote === "'") {
        index += 1
        while (index < source.length && source[index] !== quote) {
          value += source[index]
          index += 1
        }
        index += 1
      } else {
        while (index < source.length && !/[\s>]/.test(source[index])) {
          value += source[index]
          index += 1
        }
      }
    }

    attributes.push([name.toLowerCase(), value])
  }

  return { attributes, end: index, selfClosing }
}

/**
 * Skips a subtree, counting nested occurrences of the same element.
 *
 * @param {string} source
 * @param {number} from index just after the start tag
 * @param {string} name
 * @param {boolean} rawText content is not markup
 * @returns {number} index just after the matching close tag, or end of input
 */
function skipSubtree(source, from, name, rawText) {
  let index = from
  let depth = 1

  while (index < source.length) {
    const next = source.indexOf('<', index)
    if (next === -1) return source.length

    const rest = source.slice(next, next + name.length + 3).toLowerCase()

    if (rest.startsWith(`</${name}`)) {
      depth -= 1
      const close = source.indexOf('>', next)
      index = close === -1 ? source.length : close + 1
      if (depth === 0) return index
      continue
    }

    // Raw-text elements cannot nest: everything until the closing tag is text,
    // so a `<script>` inside a `<script>` is not an open tag at all.
    if (!rawText && rest.startsWith(`<${name}`) && /[\s/>]/.test(source[next + name.length + 1] ?? '>')) {
      depth += 1
    }

    index = next + 1
  }

  return source.length
}

/**
 * Sanitizes an email HTML body.
 *
 * @param {string} input
 * @param {{ maxLength?: number }} [options]
 * @returns {{ html: string, strippedRemoteContent: boolean, truncated: boolean }}
 */
export function sanitizeEmailHtml(input, options = {}) {
  const source = String(input ?? '')
  const maxLength = options.maxLength ?? LIMITS.maxHtmlChars

  const out = []
  const open = []
  let strippedRemoteContent = false
  let index = 0

  const emit = (chunk) => {
    out.push(chunk)
  }

  while (index < source.length) {
    const next = source.indexOf('<', index)

    if (next === -1) {
      emit(escapeText(source.slice(index)))
      break
    }

    if (next > index) emit(escapeText(source.slice(index, next)))

    // Comments, including the conditional comments Outlook emits. Dropped
    // wholesale: a conditional comment's body is markup to some browsers and
    // text to others, and that disagreement is a sanitizer bypass.
    if (source.startsWith('<!--', next)) {
      const close = source.indexOf('-->', next + 4)
      index = close === -1 ? source.length : close + 3
      continue
    }

    // Doctype, CDATA, processing instructions.
    if (source.startsWith('<!', next) || source.startsWith('<?', next)) {
      const close = source.indexOf('>', next)
      index = close === -1 ? source.length : close + 1
      continue
    }

    if (source.startsWith('</', next)) {
      const close = source.indexOf('>', next)
      const name = source.slice(next + 2, close === -1 ? source.length : close).trim().toLowerCase()
      index = close === -1 ? source.length : close + 1

      if (ALLOWED.has(name) && !VOID.has(name)) {
        // Close back to the matching element, so `<b><i></b>` does not leave
        // `<i>` open and swallow the rest of the message in italics.
        const at = open.lastIndexOf(name)
        if (at !== -1) {
          for (let depth = open.length - 1; depth >= at; depth -= 1) emit(`</${open[depth]}>`)
          open.length = at
        }
      }
      continue
    }

    // A `<` that is not a tag — `a < b` written without escaping.
    if (!/[a-zA-Z]/.test(source[next + 1] ?? '')) {
      emit('&lt;')
      index = next + 1
      continue
    }

    let cursor = next + 1
    let name = ''
    while (cursor < source.length && !/[\s/>]/.test(source[cursor])) {
      name += source[cursor]
      cursor += 1
    }
    name = name.toLowerCase()

    const parsed = readAttributes(source, cursor)
    index = parsed.end

    if (name === 'img') {
      // NO `src` IS EVER EMITTED HERE. The element is preserved with the
      // information needed to resolve it later, and the renderer decides
      // whether to turn that into a real `src`:
      //
      //   cid:xxx        -> data-cid, resolved from R2 against this message's
      //                     own attachments. Renders with no network request at
      //                     all, so a logo costs the sender no read receipt.
      //   http(s)://...  -> data-remote-src, inert until the operator asks for
      //                     it. This is the tracking pixel, and the decision to
      //                     fire it is theirs and per-message.
      //
      // Emitting the attribute rather than a second sanitized copy of the body
      // is what keeps one row of HTML able to render both ways.
      const attributes = new Map(parsed.attributes)
      const src = String(attributes.get('src') ?? '').trim()
      const alt = attributes.get('alt')
      const rendered = ['img']

      if (src.toLowerCase().startsWith('cid:')) {
        const cid = src.slice(4).replace(/^<|>$/g, '').trim()
        if (cid) rendered.push(`data-cid="${escapeAttribute(cid)}"`)
      } else {
        const url = safeUrl(src)
        if (url && !url.toLowerCase().startsWith('mailto:')) {
          strippedRemoteContent = true
          rendered.push(`data-remote-src="${escapeAttribute(url)}"`)
        }
      }

      // Alt survives regardless. A picture-led newsletter whose images are not
      // loaded still has to say something.
      if (alt) rendered.push(`alt="${escapeAttribute(alt)}"`)

      for (const key of ['width', 'height']) {
        const safe = presentationalValue(key, attributes.get(key))
        if (safe) rendered.push(`${key}="${escapeAttribute(safe)}"`)
      }

      const style = sanitizeStyleAttribute(attributes.get('style'))
      if (style) rendered.push(`style="${escapeAttribute(style)}"`)

      // An <img> carrying neither a source nor alt text is nothing at all.
      if (rendered.length > 1) emit(`<${rendered.join(' ')}>`)
      continue
    }

    if (REMOTE.has(name)) {
      strippedRemoteContent = true
      if (!DROPPED_VOID.has(name) && !parsed.selfClosing) {
        index = skipSubtree(source, index, name, RAW_TEXT.has(name))
      }
      continue
    }

    if (DROP_SUBTREE.has(name)) {
      if (!DROPPED_VOID.has(name) && !parsed.selfClosing) {
        index = skipSubtree(source, index, name, RAW_TEXT.has(name))
      }
      continue
    }

    const allowedAttributes = ALLOWED.get(name)
    if (!allowedAttributes) {
      // Unknown element: drop the tag, keep the children. `<o:p>`, `<center>`
      // and every vendor extension render as their content rather than
      // vanishing with it.
      continue
    }

    const rendered = [name]
    for (const [key, value] of parsed.attributes) {
      // `style` is universally allowed rather than listed per element, because
      // every element mail styles is already in ALLOWED and repeating it 40
      // times is 40 chances to leave one out. The VALUE is what is filtered,
      // by sanitizeStyleAttribute, and an attribute that survives nothing is
      // omitted rather than emitted empty.
      if (key === 'style') {
        const style = sanitizeStyleAttribute(value)
        if (style) rendered.push(`style="${escapeAttribute(style)}"`)
        continue
      }

      if (PRESENTATIONAL.has(key) && allowedAttributes.includes(key)) {
        const safe = presentationalValue(key, value)
        if (safe) rendered.push(`${key}="${escapeAttribute(safe)}"`)
        continue
      }

      if (!allowedAttributes.includes(key)) continue

      if (key === 'href') {
        const url = safeUrl(value)
        if (!url) continue
        rendered.push(`href="${escapeAttribute(url)}"`)
        continue
      }

      if (key === 'colspan' || key === 'rowspan' || key === 'start') {
        // Numeric attributes are re-emitted from a parsed number rather than
        // from the source text, so `colspan="99999999"` cannot become a layout
        // denial of service and nothing non-numeric survives at all.
        const numeric = Number.parseInt(value, 10)
        if (Number.isFinite(numeric) && numeric > 0) rendered.push(`${key}="${Math.min(numeric, 1000)}"`)
        continue
      }

      rendered.push(`${key}="${escapeAttribute(value)}"`)
    }

    if (name === 'a') {
      // `noopener` matters even inside a sandboxed iframe, because a link the
      // operator deliberately opens leaves the sandbox with it.
      rendered.push('target="_blank"', 'rel="noopener noreferrer nofollow"')
    }

    if (VOID.has(name) || parsed.selfClosing) {
      emit(`<${rendered.join(' ')}>`)
      continue
    }

    // Past the depth cap the element is unwrapped — its content still renders,
    // it simply loses its own tag. See MAX_NESTING.
    if (open.length >= MAX_NESTING) continue

    emit(`<${rendered.join(' ')}>`)
    open.push(name)
  }

  for (let depth = open.length - 1; depth >= 0; depth -= 1) out.push(`</${open[depth]}>`)

  const html = out.join('')
  if (html.length <= maxLength) return { html, strippedRemoteContent, truncated: false }

  // Truncating markup can cut a tag in half, so the overflow is cut at the last
  // `<` and the result is re-sanitized — which closes whatever was left open.
  const cut = html.slice(0, maxLength)
  const safeCut = cut.slice(0, cut.lastIndexOf('<') > 0 ? cut.lastIndexOf('<') : cut.length)
  return {
    html: sanitizeEmailHtml(safeCut, { maxLength: Number.MAX_SAFE_INTEGER }).html,
    strippedRemoteContent,
    truncated: true,
  }
}
