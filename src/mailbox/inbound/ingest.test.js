import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import { ingestEmail } from './ingest.js'
import { MAILBOX } from '../domain/mailboxes.js'
import { listMessagesForThread } from '../repositories/messages.js'
import { listThreads } from '../repositories/threads.js'

/**
 * The inbound pipeline, against a REAL SQLite with the REAL migration applied.
 *
 * This is the test that matters most in the mailbox, and the reason is in this
 * repository's history: three separate times a CHECK constraint rejected a
 * value the code had started writing, and the row silently vanished. Every unit
 * test passed each time, because unit tests use fakes with no constraints. Only
 * running the real SQL against the real schema catches that class of bug — the
 * same reason scripts/lead-engine/seed.test.js exists.
 *
 * So these cases assert on ROWS THAT SURVIVED, never on what the code intended
 * to write.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations')
const schema = [
  readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0013_lead_usage_metric_nominatim.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8'),
]

/** An R2 stand-in that records what it was asked to store. */
function createBucket({ failOn = null } = {}) {
  const objects = new Map()
  return {
    objects,
    async put(key, value) {
      if (failOn && key.includes(failOn)) throw new Error('R2 unavailable')
      objects.set(key, value)
      return { key }
    },
    async get(key) {
      return objects.has(key) ? { body: objects.get(key) } : null
    },
  }
}

/** A ForwardableEmailMessage stand-in. */
function message({ from, to, raw, headers = {} }) {
  const bytes = new TextEncoder().encode(raw)
  return {
    from,
    to,
    rawSize: bytes.byteLength,
    headers: new Headers(headers),
    raw: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
  }
}

const ORDINARY = [
  'From: Jane Prospect <jane@prospect.example>',
  'To: hello@devlabconnect.com',
  'Subject: A question about your booking page',
  'Message-ID: <CAJane123@mail.prospect.example>',
  'Date: Sat, 20 Sep 2026 10:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello — could you tell me more?',
  '',
].join('\r\n')

const HTML_MAIL = [
  'From: Marketing <news@vendor.example>',
  'To: hello@devlabconnect.com',
  'Subject: Newsletter',
  'Message-ID: <news-1@vendor.example>',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Hello <b>there</b></p><script>alert(1)</script><img src="https://tracker.example/p.gif">',
  '',
].join('\r\n')

const WITH_ATTACHMENT = [
  'From: Bob <bob@partner.example>',
  'To: hello@devlabconnect.com',
  'Subject: Contract',
  'Message-ID: <att-1@partner.example>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="BOUND"',
  '',
  '--BOUND',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'See attached.',
  '',
  '--BOUND',
  'Content-Type: application/pdf; name="../../etc/passwd.pdf"',
  'Content-Disposition: attachment; filename="../../etc/passwd.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQK',
  '',
  '--BOUND--',
  '',
].join('\r\n')

const DSN = [
  'From: MAILER-DAEMON@mail.example.net (Mail Delivery System)',
  'To: bounce@devlabconnect.com',
  'Subject: Undelivered Mail Returned to Sender',
  'Message-ID: <dsn-1@mail.example.net>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=delivery-status; boundary="XYZ"',
  '',
  '--XYZ',
  'Content-Type: text/plain',
  '',
  'Delivery failed.',
  '',
  '--XYZ',
  'Content-Type: message/delivery-status',
  '',
  'Reporting-MTA: dns; mail.example.net',
  '',
  'Final-Recipient: rfc822; nobody@prospect.example',
  'Action: failed',
  'Status: 5.1.1',
  'Diagnostic-Code: smtp; 550 5.1.1 User unknown',
  '',
  '--XYZ--',
  '',
].join('\r\n')

let env

beforeEach(() => {
  env = { DB: createTestD1(schema), MAILBOX_BUCKET: createBucket() }
})

describe('ordinary inbound mail', () => {
  it('stores it, threads it and leaves it unread', async () => {
    const result = await ingestEmail(
      env,
      message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: ORDINARY }),
    )

    expect(result.status).toBe('stored')

    const threads = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    expect(threads).toHaveLength(1)
    expect(threads[0].correspondent).toBe('jane@prospect.example')
    expect(threads[0].unreadCount).toBe(1)
    expect(threads[0].messageCount).toBe(1)

    const messages = await listMessagesForThread(env.DB, threads[0].id)
    expect(messages[0].subject).toBe('A question about your booking page')
    expect(messages[0].bodyText).toContain('could you tell me more')
    expect(messages[0].isDsn).toBe(false)
    expect(messages[0].parseStatus).toBe('ok')
    // The original is retained, always.
    expect(messages[0].rawKey).toBeTruthy()
    expect(env.MAILBOX_BUCKET.objects.has(messages[0].rawKey)).toBe(true)
  })

  it('records the edge authentication verdict', async () => {
    await ingestEmail(
      env,
      message({
        from: 'jane@prospect.example',
        to: 'hello@devlabconnect.com',
        raw: ORDINARY,
        headers: {
          'authentication-results': 'mx.cloudflare.net; dkim=pass header.d=prospect.example; spf=pass; dmarc=fail',
        },
      }),
    )

    const [thread] = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    const [stored] = await listMessagesForThread(env.DB, thread.id)
    expect(stored.auth).toEqual({ spf: 'pass', dkim: 'pass', dmarc: 'fail' })
  })

  it('is idempotent — a redelivery does not duplicate the message', async () => {
    const first = await ingestEmail(
      env,
      message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: ORDINARY }),
    )
    const second = await ingestEmail(
      env,
      message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: ORDINARY }),
    )

    expect(second.status).toBe('duplicate')
    expect(second.messageId).toBe(first.messageId)

    const threads = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    expect(threads).toHaveLength(1)
    expect(threads[0].messageCount).toBe(1)
  })

  // NOTE: the genuine two-deliveries-at-once race — where both calls pass the
  // dedupe pre-check before either commits — is exercised in
  // repositories/messages.test.js instead. It cannot be written here: the D1
  // test double runs one synchronous SQLite connection, so two interleaved
  // `batch()` calls fail with "cannot start a transaction within a
  // transaction", which is an artefact of the double rather than of D1.

  it('threads a reply onto the same conversation via In-Reply-To', async () => {
    await ingestEmail(env, message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: ORDINARY }))

    const followUp = ORDINARY.replace('Message-ID: <CAJane123@mail.prospect.example>', 'Message-ID: <CAJane456@mail.prospect.example>\r\nIn-Reply-To: <CAJane123@mail.prospect.example>')
      .replace('Subject: A question', 'Subject: Re: A question')

    await ingestEmail(env, message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: followUp }))

    const threads = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    expect(threads).toHaveLength(1)
    expect(threads[0].messageCount).toBe(2)
  })
})

describe('HTML mail', () => {
  it('stores sanitized HTML and flags the stripped remote content', async () => {
    await ingestEmail(env, message({ from: 'news@vendor.example', to: 'hello@devlabconnect.com', raw: HTML_MAIL }))

    const [thread] = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    const [stored] = await listMessagesForThread(env.DB, thread.id)

    expect(stored.bodyHtml).toContain('<b>there</b>')
    expect(stored.bodyHtml).not.toContain('script')
    expect(stored.bodyHtml).not.toContain('tracker.example')
    // A tracking pixel is remote content, so removing it also means the sender
    // cannot tell the message was opened.
    expect(stored.strippedRemoteContent).toBe(true)
  })
})

describe('attachments', () => {
  it('stores them with a sanitized filename and a real R2 object', async () => {
    await ingestEmail(env, message({ from: 'bob@partner.example', to: 'hello@devlabconnect.com', raw: WITH_ATTACHMENT }))

    const [thread] = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    const [stored] = await listMessagesForThread(env.DB, thread.id)

    const { listAttachments } = await import('../repositories/messages.js')
    const attachments = await listAttachments(env.DB, stored.id)

    expect(attachments).toHaveLength(1)
    expect(attachments[0].filename).toBe('passwd.pdf')
    expect(attachments[0].originalFilename).toBe('../../etc/passwd.pdf')
    // The key is built from generated ids, so nothing from the message can
    // steer where bytes land.
    expect(attachments[0].r2Key).not.toContain('passwd')
    expect(attachments[0].r2Key).not.toContain('..')
    expect(env.MAILBOX_BUCKET.objects.has(attachments[0].r2Key)).toBe(true)
  })
})

describe('delivery status notifications', () => {
  it('accepts a null envelope sender and files it as a bounce', async () => {
    // THE CASE MOST LIKELY TO BE MISSED. Every real DSN arrives as
    // `MAIL FROM:<>`; code that treats a missing sender as invalid passes every
    // test written with ordinary mail and drops every bounce in production.
    const result = await ingestEmail(env, message({ from: '', to: 'bounce@devlabconnect.com', raw: DSN }))
    expect(result.status).toBe('stored')
    expect(result.isDsn).toBe(true)

    const threads = await listThreads(env.DB, { mailbox: MAILBOX.BOUNCE })
    expect(threads).toHaveLength(1)
    // Labelled by the address that failed, not by the reporting daemon.
    expect(threads[0].correspondent).toBe('nobody@prospect.example')

    const [stored] = await listMessagesForThread(env.DB, threads[0].id)
    expect(stored.envelopeFrom).toBe('')
    expect(stored.isDsn).toBe(true)
    expect(stored.dsn.status).toBe('5.1.1')
    expect(stored.dsn.recipient).toBe('nobody@prospect.example')
    expect(stored.dsn.diagnostic).toContain('User unknown')
  })

  it('routes a VERP subaddress to the bounce mailbox', async () => {
    await ingestEmail(
      env,
      message({ from: '', to: 'bounce+d-abc12345-def6-7890@devlabconnect.com', raw: DSN }),
    )

    const threads = await listThreads(env.DB, { mailbox: MAILBOX.BOUNCE })
    expect(threads).toHaveLength(1)
  })

  it('files a bounce as a bounce even when it arrived at an unrouted address', async () => {
    await ingestEmail(env, message({ from: '', to: 'typo@devlabconnect.com', raw: DSN }))

    expect(await listThreads(env.DB, { mailbox: MAILBOX.BOUNCE })).toHaveLength(1)
    expect(await listThreads(env.DB, { mailbox: MAILBOX.OTHER })).toHaveLength(0)
  })

  it('does not suppress anything when the bounce matches no draft', async () => {
    await ingestEmail(env, message({ from: '', to: 'bounce@devlabconnect.com', raw: DSN }))

    const suppression = await env.DB.prepare('SELECT COUNT(*) AS n FROM lead_suppression').first()
    // Guessing which address an uncorrelated report is about would suppress a
    // business permanently, and that is not reversible from the bounce path.
    expect(Number(suppression.n)).toBe(0)
  })
})

describe('catch-all routing', () => {
  it('keeps mail sent to an address no rule matches', async () => {
    const misaddressed = ORDINARY.replace('To: hello@', 'To: helo@')
    await ingestEmail(env, message({ from: 'jane@prospect.example', to: 'helo@devlabconnect.com', raw: misaddressed }))

    const threads = await listThreads(env.DB, { mailbox: MAILBOX.OTHER })
    expect(threads).toHaveLength(1)
  })
})

describe('failure handling', () => {
  it('stores a message whose MIME cannot be parsed, rather than dropping it', async () => {
    const garbage = 'this is not a message at all\u0000\u0001\u0002'
    const result = await ingestEmail(
      env,
      message({ from: 'weird@sender.example', to: 'hello@devlabconnect.com', raw: garbage }),
    )

    expect(result.status).toBe('stored')

    const [thread] = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    const [stored] = await listMessagesForThread(env.DB, thread.id)
    // Whether postal-mime salvages headers or gives up, the row and the
    // original both exist. That is the whole guarantee.
    expect(stored.rawKey).toBeTruthy()
    expect(env.MAILBOX_BUCKET.objects.has(stored.rawKey)).toBe(true)
  })

  it('records the message even when storage is unavailable', async () => {
    env.MAILBOX_BUCKET = createBucket({ failOn: 'mailbox/raw' })

    const result = await ingestEmail(
      env,
      message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: ORDINARY }),
    )
    expect(result.status).toBe('stored')

    const [thread] = await listThreads(env.DB, { mailbox: MAILBOX.HELLO })
    const [stored] = await listMessagesForThread(env.DB, thread.id)
    expect(stored.parseStatus).toBe('raw_unavailable')
    expect(stored.rawKey).toBeNull()
    // Losing the original to an outage is bad. Losing the knowledge that a
    // message arrived is worse, and is what this asserts did not happen.
    expect(stored.bodyText).toContain('could you tell me more')
  })

  it('works with no R2 binding at all', async () => {
    env.MAILBOX_BUCKET = undefined

    const result = await ingestEmail(
      env,
      message({ from: 'jane@prospect.example', to: 'hello@devlabconnect.com', raw: ORDINARY }),
    )

    expect(result.status).toBe('stored')
    expect(result.parseStatus).toBe('raw_unavailable')
  })
})
