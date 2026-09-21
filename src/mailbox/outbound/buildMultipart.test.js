import { describe, expect, it } from 'vitest'
import { buildOutboundMessage } from './buildMessage.js'

/**
 * The multipart half of the outbound builder.
 *
 * Attachments are assembled HERE rather than by the transmitter, for the same
 * reason the headers are: n8n's send node hands nodemailer a fixed object and
 * cannot set In-Reply-To, References or an envelope. Keeping the whole RFC 5322
 * message on this side is what makes threading and VERP possible, and it means
 * adding attachments needs no change on the n8n side at all — `raw` simply
 * becomes multipart.
 */

const base = {
  to: { email: 'someone@example.com', name: 'Someone' },
  subject: 'Proposal',
  bodyText: 'Attached, as promised.',
  messageId: 'm.o-1.abc@devlabconnect.com',
  date: new Date('2026-09-21T12:00:00Z'),
}

const bytes = (text) => new TextEncoder().encode(text)

const attachment = (overrides = {}) => ({
  filename: 'proposal.pdf',
  contentType: 'application/pdf',
  bytes: bytes('%PDF-1.4 hello'),
  ...overrides,
})

function boundaryOf(message) {
  return /boundary="([^"]+)"/.exec(message)?.[1] ?? null
}

describe('without attachments', () => {
  it('is unchanged: a single text/plain part', () => {
    const message = buildOutboundMessage(base)
    expect(message).toContain('Content-Type: text/plain; charset=utf-8')
    expect(message).not.toContain('multipart')
    expect(message).toContain('Attached, as promised.')
  })

  it('treats an empty attachment list as no attachments', () => {
    expect(buildOutboundMessage({ ...base, attachments: [] })).not.toContain('multipart')
  })
})

describe('with attachments', () => {
  it('becomes multipart/mixed and keeps the text as the first part', () => {
    const message = buildOutboundMessage({ ...base, attachments: [attachment()] })
    const boundary = boundaryOf(message)

    expect(boundary).toBeTruthy()
    expect(message).toContain(`Content-Type: multipart/mixed; boundary="${boundary}"`)

    const parts = message.split(`--${boundary}`)
    // preamble, text part, attachment part, closing delimiter
    expect(parts).toHaveLength(4)
    expect(parts[1]).toContain('Content-Type: text/plain; charset=utf-8')
    expect(parts[1]).toContain('Attached, as promised.')
    expect(parts[2]).toContain('Content-Type: application/pdf')
  })

  it('closes with the terminating delimiter, or the message is malformed', () => {
    const message = buildOutboundMessage({ ...base, attachments: [attachment()] })
    expect(message.trimEnd().endsWith(`--${boundaryOf(message)}--`)).toBe(true)
  })

  it('base64-encodes the bytes and wraps at 76 characters', () => {
    const big = new Uint8Array(1000).fill(65)
    const message = buildOutboundMessage({ ...base, attachments: [attachment({ bytes: big })] })

    expect(message).toContain('Content-Transfer-Encoding: base64')
    for (const line of message.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(998)
    }
    // The base64 body begins after the part's blank separator line, which
    // follows Content-Disposition rather than Content-Transfer-Encoding.
    const encoded = message.split('\r\n\r\n').pop().split('\r\n--')[0]
    for (const line of encoded.split('\r\n').filter(Boolean)) {
      expect(line.length).toBeLessThanOrEqual(76)
    }
    expect(atob(encoded.replaceAll('\r\n', '')).length).toBe(1000)
  })

  it('carries several attachments, each as its own part', () => {
    const message = buildOutboundMessage({
      ...base,
      attachments: [attachment(), attachment({ filename: 'notes.txt', contentType: 'text/plain' })],
    })
    const parts = message.split(`--${boundaryOf(message)}`)
    expect(parts).toHaveLength(5)
    expect(message).toContain('filename="proposal.pdf"')
    expect(message).toContain('filename="notes.txt"')
  })
})

describe('the boundary', () => {
  it('differs between messages, so one cannot be predicted from another', () => {
    const a = boundaryOf(buildOutboundMessage({ ...base, attachments: [attachment()] }))
    const b = boundaryOf(buildOutboundMessage({ ...base, attachments: [attachment()] }))
    expect(a).not.toBe(b)
  })

  it('never appears inside the content it delimits', () => {
    // A body containing the boundary would end the part early and expose the
    // rest as headers. Base64 output cannot contain it, and the text part is
    // checked against it.
    const message = buildOutboundMessage({
      ...base,
      bodyText: 'ordinary text',
      attachments: [attachment()],
    })
    const boundary = boundaryOf(message)
    const textPart = message.split(`--${boundary}`)[1]
    expect(textPart.includes(boundary)).toBe(false)
  })
})

describe('the filename cannot break out of its header', () => {
  it('refuses CR and LF rather than letting them inject a header', () => {
    const message = buildOutboundMessage({
      ...base,
      attachments: [attachment({ filename: 'a\r\nBcc: victim@example.com\r\n.pdf' })],
    })
    // The text may survive inside the quoted filename — harmlessly, since it is
    // a parameter value. What must not survive is a LINE beginning with it,
    // because that is what a receiver parses as a header.
    expect(message.split('\r\n').some((line) => /^bcc:/i.test(line))).toBe(false)
    expect(message).toContain('filename="aBcc: victim@example.com.pdf"')
  })

  it('refuses a quote that would close the filename parameter', () => {
    const message = buildOutboundMessage({
      ...base,
      attachments: [attachment({ filename: 'a".pdf' })],
    })
    expect(message).not.toContain('filename="a".pdf"')
  })

  it('encodes a non-ASCII filename rather than emitting raw bytes', () => {
    const message = buildOutboundMessage({
      ...base,
      attachments: [attachment({ filename: 'Angebot Übersicht.pdf' })],
    })
    // RFC 2231: the parameter is continued as filename* with a charset.
    expect(message).toContain("filename*=UTF-8''")
    expect(message).toContain('%C3%9C')
  })

  it('falls back to a usable name when nothing survives sanitising', () => {
    const message = buildOutboundMessage({ ...base, attachments: [attachment({ filename: '' })] })
    expect(message).toMatch(/filename="attachment(?:\.bin)?"/)
  })
})

describe('the content type is not taken on trust', () => {
  it('falls back to octet-stream for a missing or malformed type', () => {
    for (const contentType of [undefined, '', 'not a type', 'text/plain\r\nBcc: x@y.z']) {
      const message = buildOutboundMessage({ ...base, attachments: [attachment({ contentType })] })
      expect(message).not.toContain('Bcc:')
      expect(message).toMatch(/Content-Type: [a-z]+\/[a-z0-9.+-]+/i)
    }
  })
})
