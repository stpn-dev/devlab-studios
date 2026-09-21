/**
 * Turns the inert image placeholders left by the sanitizer into real sources.
 *
 * src/mailbox/inbound/sanitizeHtml.js never emits a `src`. It parks what it
 * found on `data-cid` (an attachment of this same message) or `data-remote-src`
 * (a URL on the sender's server) and leaves the decision to the renderer. This
 * module is that decision, kept out of the React component so it can be tested
 * as what it is: a string transform with two security-relevant rules.
 *
 *   1. A `data-cid` resolves ONLY to a `data:` image URL that the PARENT
 *      fetched. It cannot be a link back to our own API, because the admin
 *      session cookie is SameSite=Strict and a `sandbox=""` iframe has a null
 *      site-for-cookies -- the frame's own request would arrive unauthenticated
 *      and 401. The parent is same-site, fetches the bytes with the session,
 *      and hands the frame something inert. Either way no third party is
 *      contacted, so a logo costs the sender no read receipt.
 *   2. A `data-remote-src` becomes a `src` only when the operator has asked for
 *      it, for that one message. There is deliberately no "always load"
 *      setting — that is how tracking protection quietly stops existing.
 *
 * The input is already sanitized and attribute-escaped, and every value
 * substituted in is either a base64 `data:` image or a URL that passed the
 * sanitizer's scheme allowlist, so no further escaping is introduced here.
 */

/**
 * The only thing substitutable for a cid.
 *
 * Restricted to raster image types on purpose: `image/svg+xml` is a document,
 * not a picture, and can carry script. The sandbox would stop that script
 * running, but a defence that depends on exactly one control is the thing this
 * codebase keeps refusing to build.
 */
const INLINE_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]*$/i

/**
 * Maps each attachment's Content-ID to its id.
 *
 * Senders write the header as `<f_abc123>`; the HTML references it as
 * `cid:f_abc123`. The brackets are stripped on both sides so the two meet.
 *
 * @param {Array<{ id: string, contentId?: string|null }>} attachments
 * @returns {Map<string, string>}
 */
export function buildCidMap(attachments) {
  const map = new Map()
  for (const attachment of attachments ?? []) {
    const cid = String(attachment?.contentId ?? '')
      .trim()
      .replace(/^<|>$/g, '')
    if (cid && attachment?.id) map.set(cid.toLowerCase(), attachment.id)
  }
  return map
}

/**
 * Resolves the placeholders in a sanitized body.
 *
 * @param {string} html sanitized HTML from the ingest pipeline
 * @param {{ cidSrc?: Map<string, string>, loadRemote?: boolean }} options
 *   cidSrc maps a Content-ID to a `data:` image URL the parent already fetched.
 * @returns {string}
 */
export function resolveMessageHtml(html, options = {}) {
  const { cidSrc = new Map(), loadRemote = false } = options
  let output = String(html ?? '')

  output = output.replace(/\sdata-cid="([^"]*)"/gi, (_match, cid) => {
    const src = cidSrc.get(String(cid).trim().toLowerCase())
    // An unresolved or unacceptable cid drops the attribute rather than leaving
    // it in the document. The image renders as its alt text, which is what any
    // mail client shows for a part the sender referenced but never attached.
    if (!src || !INLINE_IMAGE.test(src)) return ''
    return ` src="${src}"`
  })

  if (loadRemote) {
    output = output.replace(/\sdata-remote-src="([^"]*)"/gi, (_match, url) => ` src="${url}"`)
  }

  return output
}

/**
 * Whether anything in this body is waiting on the operator's permission.
 *
 * Read from the HTML rather than from `strippedRemoteContent`, because that
 * flag is also set by stylesheets, video and other elements that were dropped
 * outright — offering to "load images" for a message with none would be a
 * button that does nothing.
 *
 * @param {string} html
 */
export function hasDeferredRemoteImages(html) {
  return /\sdata-remote-src="/i.test(String(html ?? ''))
}
