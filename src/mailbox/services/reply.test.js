import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import { ingestEmail } from '../inbound/ingest.js'
import { composeReply, renderOutbound } from './reply.js'
import { MAILBOX } from '../domain/mailboxes.js'
import { parseMessageId } from '../domain/messageId.js'
import { collectQueued, getOutbound, markSent } from '../repositories/outbound.js'
import { listThreads } from '../repositories/threads.js'
import { addSuppression } from '../../lead-engine/repositories/suppression.js'

/**
 * The reply path, from an inbound message to a message ready for the wire.
 *
 * WHAT THESE CASES ARE REALLY GUARDING is the reason this application builds the
 * whole RFC 5322 message rather than handing fields to the transmitter: n8n's
 * Send Email node cannot set `In-Reply-To`, `References`, `Message-ID` or the
 * envelope sender. If the assembly here regressed, replies would still "work"
 * — they would arrive, as a new conversation, with bounces that correlate to
 * nothing. Nothing else in the system would notice.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations')
const schema = [
  readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0013_lead_usage_metric_nominatim.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8'),
]

const INBOUND = [
  'From: Jane Prospect <jane@prospect.example>',
  'To: hello@devlabconnect.com',
  'Subject: A question about your booking page',
  'Message-ID: <CAJane123@mail.prospect.example>',
  'References: <root@mail.prospect.example>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Could you tell me more?',
  '',
].join('\r\n')

function bucket() {
  const objects = new Map()
  return { objects, async put(key, value) { objects.set(key, value); return { key } }, async get(key) { return objects.has(key) ? { body: objects.get(key) } : null } }
}

function message(raw, { from = 'jane@prospect.example', to = 'hello@devlabconnect.com' } = {}) {
  const bytes = new TextEncoder().encode(raw)
  return {
    from,
    to,
    rawSize: bytes.byteLength,
    headers: new Headers(),
    raw: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }),
  }
}

let env
let threadId

beforeEach(async () => {
  env = { DB: createTestD1(schema), MAILBOX_BUCKET: bucket(), LEAD_ENGINE_ENABLED: 'true' }
  await ingestEmail(env, message(INBOUND))
  const [thread] = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
  threadId = thread.id
})

describe('composeReply', () => {
  it('queues a reply addressed to the sender, with threading headers', async () => {
    const queued = await composeReply(env, { bodyText: 'Happy to help.', threadId, actorEmail: 'admin@devlabstudios.com' })

    expect(queued.status).toBe('queued')
    expect(queued.toAddress).toBe('jane@prospect.example')
    expect(queued.subject).toBe('Re: A question about your booking page')
    expect(queued.inReplyTo).toBe('CAJane123@mail.prospect.example')
    // The parent's References, then the parent itself — RFC 5322 §3.6.4.
    expect(queued.references).toBe('<root@mail.prospect.example> <CAJane123@mail.prospect.example>')
    expect(queued.createdBy).toBe('admin@devlabstudios.com')
  })

  it('encodes its own id in the Message-ID and in the VERP return path', async () => {
    const queued = await composeReply(env, { bodyText: 'Hello.', threadId })

    expect(parseMessageId(queued.messageId)).toEqual({ kind: 'o', id: queued.id })
    expect(queued.envelopeFrom).toBe(`bounce+o-${queued.id}@devlabconnect.com`)
  })

  it('does not add a second Re: to an already-prefixed subject', async () => {
    const queued = await composeReply(env, { bodyText: 'x', threadId })
    const second = await composeReply(env, { bodyText: 'y', threadId, subject: queued.subject })
    expect(second.subject).toBe('Re: A question about your booking page')
  })

  it('refuses to reply to a suppressed address', async () => {
    // Re-checked HERE, at the moment of composing — someone may have
    // unsubscribed between sending their message and this reply being written.
    await addSuppression(env.DB, {
      scope: 'email',
      value: 'jane@prospect.example',
      reason: 'unsubscribe',
      // 'inbound_reply', not 'reply': lead_suppression.source has a CHECK, and
      // a value outside it is rejected. addSuppression verifies the row landed
      // and throws rather than letting it vanish — the guard that exists
      // because this schema has lost rows to exactly this three times.
      source: 'inbound_reply',
    })

    await expect(composeReply(env, { bodyText: 'Hello.', threadId })).rejects.toThrow(/suppressed/i)

    const queued = await collectQueued(env.DB)
    expect(queued).toHaveLength(0)
  })

  it('refuses an empty body and an unknown thread', async () => {
    await expect(composeReply(env, { bodyText: '   ', threadId })).rejects.toThrow(/body/i)
    await expect(composeReply(env, { bodyText: 'x', threadId: 'nope' })).rejects.toThrow(/not found/i)
  })

  it('prefers Reply-To over From when the sender set one', async () => {
    const withReplyTo = INBOUND.replace(
      'Message-ID: <CAJane123@mail.prospect.example>',
      'Message-ID: <CAJane999@mail.prospect.example>\r\nReply-To: inbox@prospect.example',
    ).replace('Subject: A question', 'Subject: Another question')

    await ingestEmail(env, message(withReplyTo))
    const threads = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    const other = threads.find((thread) => thread.subject.startsWith('Another question'))

    const queued = await composeReply(env, { bodyText: 'x', threadId: other.id })
    expect(queued.toAddress).toBe('inbox@prospect.example')
  })
})

describe('renderOutbound', () => {
  it('produces a message and an envelope that are not derivable from each other', async () => {
    const queued = await composeReply(env, { bodyText: 'Happy to help.\nBest,\nDevLab', threadId })
    const rendered = renderOutbound(queued)

    // The envelope sender is the VERP address; the visible From is not. A
    // transmitter that infers MAIL FROM from the From: header loses the
    // identifier entirely, which is why these are separate fields.
    expect(rendered.envelope.from).toBe(`bounce+o-${queued.id}@devlabconnect.com`)
    expect(rendered.envelope.to).toEqual(['jane@prospect.example'])
    expect(rendered.raw).toContain('From: DevLab Studios <hello@devlabconnect.com>')

    expect(rendered.raw).toContain('To: Jane Prospect <jane@prospect.example>')
    expect(rendered.raw).toContain(`Message-ID: <${queued.messageId}>`)
    expect(rendered.raw).toContain('In-Reply-To: <CAJane123@mail.prospect.example>')
    expect(rendered.raw).toContain('References: <root@mail.prospect.example>')
    expect(rendered.raw).toContain('Subject: Re: A question about your booking page')
    expect(rendered.raw).toContain('Happy to help.')

    // Headers and body separated by a blank line, CRLF throughout.
    expect(rendered.raw).toContain('\r\n\r\n')
    // Not a draft marker: that would make Outlook treat a received message as
    // an unsent one. buildEmlMessage emits it; this must not.
    expect(rendered.raw).not.toContain('X-Unsent')
  })

  it('cannot have headers injected through the subject', async () => {
    const queued = await composeReply(env, {
      bodyText: 'x',
      threadId,
      subject: 'Hello\r\nBcc: attacker@evil.example',
    })
    const rendered = renderOutbound(queued)

    // The text survives INSIDE the subject; what must not exist is a header
    // line of its own, which is what a bare CRLF would have produced.
    expect(rendered.raw).toContain('Subject: Hello Bcc: attacker@evil.example')

    // Asserted on the header block specifically. A naive `not.toContain('Bcc:')`
    // would fail on the sanitized subject's own text and prove nothing about
    // whether a real header was injected.
    const headerBlock = rendered.raw.split('\r\n\r\n')[0]
    expect(headerBlock.split('\r\n').some((line) => /^bcc:/i.test(line))).toBe(false)
  })
})

describe('the collect / confirm round trip', () => {
  it('hands a reply out once and records it in the thread only when confirmed', async () => {
    const queued = await composeReply(env, { bodyText: 'Happy to help.', threadId })

    const first = await collectQueued(env.DB)
    expect(first).toHaveLength(1)
    expect(first[0].id).toBe(queued.id)
    expect(first[0].status).toBe('collected')

    // Never offered twice. If the transmitter dies now, this reply is unsent
    // and sits in the CMS — rather than being mailed to a stranger twice.
    expect(await collectQueued(env.DB)).toHaveLength(0)

    await markSent(env.DB, queued.id, { providerMessageId: 'smtp-1' })
    const confirmed = await getOutbound(env.DB, queued.id)
    expect(confirmed.status).toBe('sent')
    expect(confirmed.providerMessageId).toBe('smtp-1')
  })

  it('treats a repeated confirmation as the same send', async () => {
    const queued = await composeReply(env, { bodyText: 'x', threadId })
    await collectQueued(env.DB)

    const first = await markSent(env.DB, queued.id)
    const second = await markSent(env.DB, queued.id)
    expect(first.status).toBe('ok')
    expect(second.status).toBe('already_sent')
    expect(second.outbound.sentAt).toBe(first.outbound.sentAt)
  })

  it('keeps a failed reply out of the queue unless it is called retryable', async () => {
    const { markFailed } = await import('../repositories/outbound.js')
    const queued = await composeReply(env, { bodyText: 'x', threadId })
    await collectQueued(env.DB)

    await markFailed(env.DB, queued.id, { error: 'connection refused' })
    expect((await getOutbound(env.DB, queued.id)).status).toBe('failed')
    // A reply that silently re-queued forever would mail the same person
    // repeatedly the moment the fault cleared.
    expect(await collectQueued(env.DB)).toHaveLength(0)

    await markFailed(env.DB, queued.id, { error: 'temporary', retryable: true })
    expect((await getOutbound(env.DB, queued.id)).status).toBe('queued')
    expect(await collectQueued(env.DB)).toHaveLength(1)
  })

  it('hands a reply to only one of two transmitters polling at once', async () => {
    // The claim-by-UPDATE carries `WHERE status = 'queued'` precisely so this
    // cannot double-send. Asserted concurrently rather than sequentially,
    // because a sequential call is already excluded by the status change and
    // would prove nothing about the race the guard exists for.
    await composeReply(env, { bodyText: 'x', threadId })

    const [first, second] = await Promise.all([collectQueued(env.DB), collectQueued(env.DB)])

    expect(first.length + second.length).toBe(1)
  })

  it('cancels only a reply nobody has taken', async () => {
    const { cancelOutbound } = await import('../repositories/outbound.js')
    const queued = await composeReply(env, { bodyText: 'x', threadId })

    await cancelOutbound(env.DB, queued.id)
    expect((await getOutbound(env.DB, queued.id)).status).toBe('cancelled')

    const second = await composeReply(env, { bodyText: 'y', threadId })
    await collectQueued(env.DB)
    // Once collected we cannot know whether it reached an MTA, so "cancelled"
    // would be a claim we cannot support.
    await expect(cancelOutbound(env.DB, second.id)).rejects.toThrow(/no longer be cancelled/i)
  })
})
