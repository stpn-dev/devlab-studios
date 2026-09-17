/**
 * Versioned consent text.
 *
 * The exact sentence a visitor agreed to is recorded with their inquiry by
 * VERSION, not by copying the wording into every row — so changing the
 * wording later never rewrites what past visitors actually consented to.
 * Bump the version whenever the text below changes in a way that alters its
 * meaning.
 */

export const CONSENT_TEXT_VERSION = '2026-09-17'
export const PRIVACY_POLICY_VERSION = '2026-09-17'

export const CONSENT_TEXT =
  'I agree that DevLab Studios may store this inquiry and contact me about it.'

export const CONSENT_TYPES = {
  contact: 'contact',
  leadMagnet: 'lead_magnet',
}
