import { describe, expect, it } from 'vitest'
import { buildEmlFilename, buildEmlMessage, encodeHeaderValue, formatAddress, formatDate } from './eml.js'

/**
 * The file has to be one a real mail client opens as a draft.
 *
 * This replaced writing into a mailbox over an API, so there is no provider
 * left to reject a malformed message and tell us. The failure mode if this is
 * wrong is an operator double-clicking a file that does nothing, which is why
 * the header encoding and line limits are asserted rather than assumed.
 */

const BASE = {
  to: { email: 'hello@example.com' },
  subject: 'A question about your intake process',
  bodyText: 'Hello,\n\nA short note.\n\nStephen',
  date: new Date('2026-09-19T04:05:06Z'),
}

const BLANK_LINE = '\r\n\r\n'

const headerOf = (message, name) =>
  message
    .slice(0, message.indexOf(BLANK_LINE))
    .split('\r\n')
    .find((line) => line.startsWith(`${name}: `))

describe('encodeHeaderValue', () => {
  it('leaves printable ASCII alone', () => {
    expect(encodeHeaderValue('A plain subject')).toBe('A plain subject')
  })

  it('encodes anything outside printable ASCII', () => {
    // An em dash in a subject is ordinary. Emitted raw it renders as mojibake
    // in some clients and is rejected outright by others.
    const encoded = encodeHeaderValue('Un café — naïve')

    expect(encoded.startsWith('=?UTF-8?B?')).toBe(true)
    expect(encoded.endsWith('?=')).toBe(true)
  })

  it('strips CR and LF, which would otherwise inject a header', () => {
    // A subject carrying a newline could append `Bcc:` to the message. The
    // draft text is operator-supplied and AI-generated, so this is not
    // theoretical.
    const encoded = encodeHeaderValue('Subject\r\nBcc: someone@evil.example')

    expect(encoded).not.toMatch(/[\r\n]/)
    expect(encoded).toContain('Bcc: someone@evil.example')
  })
})

describe('formatAddress', () => {
  it('returns a bare address when there is no display name', () => {
    expect(formatAddress({ email: 'hello@example.com' })).toBe('hello@example.com')
  })

  it('quotes a display name containing a comma', () => {
    // Unquoted, "Smith, Jane <x@y>" parses as two recipients.
    const formatted = formatAddress({ email: 'jane@example.com', name: 'Smith, Jane' })

    expect(formatted.startsWith('"')).toBe(true)
    expect(formatted).toContain('<jane@example.com>')
  })

  it('strips angle brackets from the address itself', () => {
    expect(formatAddress({ email: 'a<b>@example.com' })).toBe('ab@example.com')
  })
})

describe('formatDate', () => {
  it('emits an RFC 5322 date with a numeric offset', () => {
    // toUTCString() says "GMT" where the spec wants "+0000", and some clients
    // are fussy about it.
    expect(formatDate(new Date('2026-09-19T04:05:06Z'))).toBe('Sat, 19 Sep 2026 04:05:06 +0000')
  })
})

describe('buildEmlMessage', () => {
  it('produces headers, a blank line, then the body', () => {
    const message = buildEmlMessage(BASE)
    // Split once: the body has blank lines of its own, so a plain split()
    // would chop it up and quietly assert against only its first paragraph.
    const boundary = message.indexOf(BLANK_LINE)
    const headers = message.slice(0, boundary)
    const body = message.slice(boundary + BLANK_LINE.length)

    expect(headers).toContain('To: hello@example.com')
    expect(headers).toContain('MIME-Version: 1.0')
    expect(body).toContain('A short note.')
  })

  it('marks the message unsent so Outlook opens it composable', () => {
    expect(buildEmlMessage(BASE)).toContain('X-Unsent: 1')
  })

  it('omits From entirely when no sender identity is configured', () => {
    // Better than asserting an identity the operator's mailbox does not have:
    // their client fills in whichever account they open it with.
    expect(headerOf(buildEmlMessage(BASE), 'From')).toBeUndefined()
  })

  it('includes From when the identity is configured', () => {
    const message = buildEmlMessage({ ...BASE, from: { email: 'me@devlabstudios.com', name: 'Stephen' } })

    expect(headerOf(message, 'From')).toBe('From: Stephen <me@devlabstudios.com>')
  })

  it('threads a reply with In-Reply-To and References', () => {
    const message = buildEmlMessage({
      ...BASE,
      inReplyTo: 'abc@mail.example',
      references: ['root@mail.example'],
    })

    expect(headerOf(message, 'In-Reply-To')).toBe('In-Reply-To: <abc@mail.example>')
    // The whole chain, so the reply lands in the existing thread rather than
    // starting a new conversation in the recipient's client.
    expect(headerOf(message, 'References')).toBe('References: <root@mail.example> <abc@mail.example>')
  })

  it('does not duplicate the parent id when it is already in the chain', () => {
    const message = buildEmlMessage({ ...BASE, inReplyTo: '<abc@mail.example>', references: ['<abc@mail.example>'] })

    expect(headerOf(message, 'References')).toBe('References: <abc@mail.example>')
  })

  it('wraps long lines under the RFC limit', () => {
    const message = buildEmlMessage({ ...BASE, bodyText: 'word '.repeat(400).trim() })

    for (const line of message.split('\r\n')) {
      expect(line.length).toBeLessThan(998)
    }
  })

  it('keeps a long URL on one line rather than breaking it', () => {
    // An over-long line is a formatting problem; a broken link is a dead call
    // to action.
    const url = `https://example.com/${'a'.repeat(120)}`
    const message = buildEmlMessage({ ...BASE, bodyText: `See ${url}` })

    expect(message).toContain(url)
  })

  it('cannot have its headers injected through the subject', () => {
    const message = buildEmlMessage({ ...BASE, subject: 'Hi\r\nBcc: someone@evil.example' })
    const headerBlock = message.slice(0, message.indexOf(BLANK_LINE))

    expect(headerBlock.split('\r\n').some((line) => line.startsWith('Bcc:'))).toBe(false)
  })

  it('separates headers from body with exactly one blank line', () => {
    // Two blank lines would push the first body line into the headers as far
    // as some parsers are concerned.
    const message = buildEmlMessage(BASE)

    expect(message).not.toMatch(/\r\n\r\n\r\n/)
  })
})

describe('buildEmlFilename', () => {
  it('names the file after the company', () => {
    expect(buildEmlFilename({ companyName: 'The Leffler Firm', subject: 'x' })).toBe('the-leffler-firm.eml')
  })

  it('strips characters a filesystem would refuse', () => {
    expect(buildEmlFilename({ companyName: 'A/B: "C" <D>' })).toMatch(/^[\w-]+\.eml$/)
  })

  it('falls back rather than producing a bare extension', () => {
    expect(buildEmlFilename({ companyName: '///', subject: null })).toBe('outreach.eml')
  })
})
