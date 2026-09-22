/**
 * Where an outbound attachment's bytes came from.
 *
 * Enforced here, by code that throws, rather than by a CHECK constraint on
 * `mailbox_outbound_attachments.source`. The set grows whenever anyone adds
 * another place to attach from, and this schema has three separate occasions
 * where a CHECK plus an `INSERT OR IGNORE` silently discarded rows instead of
 * failing. Same reasoning as domain/mailboxes.js and domain/activity.js.
 */

export const ATTACHMENT_SOURCE = Object.freeze({
  /** A file the operator chose from their own machine. */
  UPLOAD: 'upload',
  /** A part forwarded from a message we received; the bytes are already in R2. */
  INBOUND: 'inbound',
  /** A file already in the CMS media bucket — a capability deck, a case study. */
  ASSET: 'asset',
})

export const ALL_ATTACHMENT_SOURCES = Object.freeze(Object.values(ATTACHMENT_SOURCE))

/** @param {string} value */
export function isValidAttachmentSource(value) {
  return ALL_ATTACHMENT_SOURCES.includes(value)
}

/**
 * @param {string} value
 * @returns {string} the source, unchanged
 */
export function assertAttachmentSource(value) {
  if (!isValidAttachmentSource(value)) {
    throw new Error(`Unknown attachment source "${value}". Expected one of: ${ALL_ATTACHMENT_SOURCES.join(', ')}.`)
  }
  return value
}

/**
 * Total bytes one outgoing message may carry.
 *
 * 10 MB matches Postfix's default `message_size_limit`, so nothing is accepted
 * in the UI that the MTA will then refuse — a send that fails after the
 * operator was told the upload succeeded is worse than an upload that is
 * refused up front. Base64 inflates this by a third on the wire, which still
 * leaves headroom under the limit.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** No single part may exceed the total, obviously, but say it once and reuse it. */
export const MAX_SINGLE_ATTACHMENT_BYTES = MAX_TOTAL_ATTACHMENT_BYTES

/** More than this on one message is a sign something is wrong, not a use case. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10
