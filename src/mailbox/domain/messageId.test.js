import { describe, expect, it } from 'vitest'
import {
  KIND_DRAFT,
  KIND_OUTBOUND,
  buildMessageId,
  buildReferenceChain,
  parseMessageId,
  parseReferences,
  stripBrackets,
} from './messageId.js'

describe('buildMessageId / parseMessageId', () => {
  it('round-trips an identifier', () => {
    const id = buildMessageId({ kind: KIND_DRAFT, id: 'abc12345-def6' })
    expect(id).toMatch(/^m\.d-abc12345-def6\.[0-9a-f]{16}@devlabconnect\.com$/)
    expect(parseMessageId(id)).toEqual({ kind: 'd', id: 'abc12345-def6' })
  })

  it('parses with or without angle brackets', () => {
    const id = buildMessageId({ kind: KIND_OUTBOUND, id: 'xyz789' })
    expect(parseMessageId(`<${id}>`)).toEqual({ kind: 'o', id: 'xyz789' })
  })

  it('makes each call unique, so two messages for one draft do not collide', () => {
    const a = buildMessageId({ kind: KIND_DRAFT, id: 'same' })
    const b = buildMessageId({ kind: KIND_DRAFT, id: 'same' })
    expect(a).not.toBe(b)
    expect(parseMessageId(a).id).toBe(parseMessageId(b).id)
  })

  it('refuses identifiers that are not ours', () => {
    expect(parseMessageId('<CABcd123@mail.gmail.com>')).toBeNull()
    // Right domain, wrong shape — another sender at our own domain.
    expect(parseMessageId('<something@devlabconnect.com>')).toBeNull()
    expect(parseMessageId('<m.d-abc@example.com>')).toBeNull()
    expect(parseMessageId(null)).toBeNull()
  })

  it('sanitizes the id it encodes', () => {
    expect(parseMessageId(buildMessageId({ kind: KIND_DRAFT, id: 'a@b c' }))).toEqual({ kind: 'd', id: 'abc' })
  })
})

describe('stripBrackets', () => {
  it('normalizes to a bracketless id', () => {
    expect(stripBrackets('<a@b.com>')).toBe('a@b.com')
    expect(stripBrackets('  <a@b.com>  ')).toBe('a@b.com')
    expect(stripBrackets('a@b.com')).toBe('a@b.com')
  })

  it('rejects a mangled value rather than storing one that can never match', () => {
    expect(stripBrackets('<a@b.com> <c@d.com>')).toBeNull()
    expect(stripBrackets('no-at-sign')).toBeNull()
    expect(stripBrackets('')).toBeNull()
    expect(stripBrackets(null)).toBeNull()
  })
})

describe('parseReferences', () => {
  it('reads a normal chain, oldest first', () => {
    expect(parseReferences('<a@x> <b@x> <c@x>')).toEqual(['a@x', 'b@x', 'c@x'])
  })

  it('handles folded headers and repeated ids', () => {
    expect(parseReferences('<a@x>\r\n <b@x>\r\n <a@x>')).toEqual(['a@x', 'b@x'])
  })

  it('falls back to a whitespace split when a sender omits brackets', () => {
    expect(parseReferences('a@x b@x')).toEqual(['a@x', 'b@x'])
  })

  it('returns an empty chain for nothing', () => {
    expect(parseReferences(null)).toEqual([])
    expect(parseReferences('')).toEqual([])
  })
})

describe('buildReferenceChain', () => {
  it('appends the parent Message-ID to the parent References', () => {
    expect(buildReferenceChain({ parentReferences: '<a@x> <b@x>', parentMessageId: '<c@x>' })).toEqual([
      'a@x',
      'b@x',
      'c@x',
    ])
  })

  it('does not duplicate a parent already present', () => {
    expect(buildReferenceChain({ parentReferences: '<a@x> <b@x>', parentMessageId: '<b@x>' })).toEqual(['a@x', 'b@x'])
  })

  it('starts a chain when there is no parent References', () => {
    expect(buildReferenceChain({ parentMessageId: '<c@x>' })).toEqual(['c@x'])
    expect(buildReferenceChain({})).toEqual([])
  })

  it('caps a long chain, keeping the thread root', () => {
    // Cloudflare rejects a reply whose References carries more than 100
    // entries, and most clients group a thread on its first id.
    const long = Array.from({ length: 200 }, (_, index) => `<id${index}@x>`).join(' ')
    const chain = buildReferenceChain({ parentReferences: long, parentMessageId: '<last@x>' })

    expect(chain.length).toBe(50)
    expect(chain[0]).toBe('id0@x')
    expect(chain[chain.length - 1]).toBe('last@x')
  })
})
