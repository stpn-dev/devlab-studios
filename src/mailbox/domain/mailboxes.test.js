import { describe, expect, it } from 'vitest'
import {
  MAILBOX,
  draftIdFromVerp,
  mailboxForRecipient,
  splitAddress,
  verpAddress,
  verpAddressForDraft,
  verpIdentity,
} from './mailboxes.js'

describe('splitAddress', () => {
  it('splits local part, subaddress tag and domain', () => {
    expect(splitAddress('bounce+d-abc@devlabconnect.com')).toEqual({
      local: 'bounce',
      tag: 'd-abc',
      domain: 'devlabconnect.com',
    })
  })

  it('treats only `+` as the subaddress separator', () => {
    // `-` is a separator at some providers. Treating it as one here would turn
    // a real local part like `sales-team` into a tagged `sales`.
    expect(splitAddress('sales-team@devlabconnect.com')).toEqual({
      local: 'sales-team',
      tag: null,
      domain: 'devlabconnect.com',
    })
  })

  it('does not report an empty tag as a tag', () => {
    expect(splitAddress('hello+@devlabconnect.com').tag).toBeNull()
  })

  it('lowercases and rejects nonsense', () => {
    expect(splitAddress('HELLO@DevLabConnect.com').local).toBe('hello')
    expect(splitAddress('not-an-address')).toBeNull()
    expect(splitAddress('@devlabconnect.com')).toBeNull()
    expect(splitAddress('hello@')).toBeNull()
    expect(splitAddress('')).toBeNull()
  })
})

describe('mailboxForRecipient', () => {
  it('routes the addresses we publish', () => {
    expect(mailboxForRecipient('hello@devlabconnect.com')).toBe(MAILBOX.HELLO)
    expect(mailboxForRecipient('bounce@devlabconnect.com')).toBe(MAILBOX.BOUNCE)
    expect(mailboxForRecipient('dmarc@devlabconnect.com')).toBe(MAILBOX.DMARC)
    expect(mailboxForRecipient('postmaster@devlabconnect.com')).toBe(MAILBOX.POSTMASTER)
    expect(mailboxForRecipient('abuse@devlabconnect.com')).toBe(MAILBOX.ABUSE)
  })

  it('routes a subaddressed bounce to the bounce mailbox', () => {
    expect(mailboxForRecipient('bounce+d-abc12345@devlabconnect.com')).toBe(MAILBOX.BOUNCE)
  })

  it('sends anything else to `other` rather than dropping it', () => {
    // The catch-all exists so a misaddressed reply from a real prospect is
    // kept. A tidy inbox is worth less than a reply.
    expect(mailboxForRecipient('sales@devlabconnect.com')).toBe(MAILBOX.OTHER)
    expect(mailboxForRecipient('typo@devlabconnect.com')).toBe(MAILBOX.OTHER)
    expect(mailboxForRecipient('')).toBe(MAILBOX.OTHER)
  })
})

describe('VERP', () => {
  it('round-trips a draft id', () => {
    const address = verpAddressForDraft('abc12345-def6-7890-abcd-ef1234567890')
    expect(address).toBe('bounce+d-abc12345-def6-7890-abcd-ef1234567890@devlabconnect.com')
    expect(draftIdFromVerp(address)).toBe('abc12345-def6-7890-abcd-ef1234567890')
  })

  it('round-trips a mailbox reply id under a different kind', () => {
    const address = verpAddress('o', 'abcdef01-2345-6789-abcd-ef0123456789')
    expect(verpIdentity(address)).toEqual({ kind: 'o', id: 'abcdef01-2345-6789-abcd-ef0123456789' })
    // Not a draft — so the draft-keyed bounce path must not claim it.
    expect(draftIdFromVerp(address)).toBeNull()
  })

  it('strips characters that do not belong in a local part', () => {
    // Slashes and dots are removed rather than the value being truncated at
    // the first one: the id is only ever compared for equality, so a mangled
    // tag simply fails to correlate, which is the safe direction.
    expect(verpAddress('d', 'abc/../../etc')).toBe('bounce+d-abcetc@devlabconnect.com')
    expect(verpAddress('d', 'a b@c')).toBe('bounce+d-abc@devlabconnect.com')
    expect(verpAddress('d', '')).toBe('bounce@devlabconnect.com')
    // An unexpected kind falls back to a marker rather than injecting itself.
    expect(verpAddress('ZZ', 'abc123')).toBe('bounce+x-abc123@devlabconnect.com')
  })

  it('rejects tags that are not ours', () => {
    expect(verpIdentity('bounce@devlabconnect.com')).toBeNull()
    expect(verpIdentity('bounce+garbage@devlabconnect.com')).toBeNull()
    // Too short to be a real id — a guessable tag must not correlate.
    expect(verpIdentity('bounce+d-abc@devlabconnect.com')).toBeNull()
    expect(verpIdentity('hello+d-abc12345@devlabconnect.com')).toBeNull()
  })
})
