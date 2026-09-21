import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import {
  collectQueued,
  getOutbound,
  markFailed,
  markSent,
  queueOutbound,
  requeueOutbound,
} from './outbound.js'
import { createThread } from './threads.js'

/**
 * Retrying a failed reply.
 *
 * The rule this suite protects is the one the whole outbox is built around:
 * UNDER-SEND RATHER THAN DOUBLE-SEND. A failed row is terminal to every
 * automatic path, and only a person may move it back — because only a person
 * can read the error and tell "our own MTA refused it before DATA" apart from
 * "it may already be on the wire".
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations')
const schema = [
  readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0013_lead_usage_metric_nominatim.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0015_mailbox_drafts.sql'), 'utf8'),
]

const FAILURE = 'Message failed: 451 4.7.1 Service unavailable - try again later'

let db
let threadId

beforeEach(async () => {
  db = createTestD1(schema)
  const thread = await createThread(db, {
    mailbox: 'hello',
    subject: 'Test Worker',
    correspondent: 'someone@example.com',
  })
  threadId = thread.id
})

async function queueOne() {
  const id = crypto.randomUUID()
  const row = await queueOutbound(db, {
    id,
    threadId,
    mailbox: 'hello',
    toAddress: 'someone@example.com',
    subject: 'Re: Test Worker',
    bodyText: 'Hello',
    messageId: `m.o-${id}.abc@devlabconnect.com`,
    envelopeFrom: `bounce+o-${id}@devlabconnect.com`,
  })
  return row.id
}

describe('a failed reply', () => {
  it('goes back to queued, clearing the timestamps that no longer apply', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })
    await markFailed(db, id, { error: FAILURE })

    const retried = await requeueOutbound(db, id)

    expect(retried.status).toBe('queued')
    expect(retried.failedAt).toBeNull()
    expect(retried.collectedAt).toBeNull()
    expect(retried.sentAt).toBeNull()
  })

  it('keeps the error, so the record of what went wrong is not erased by retrying', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })
    await markFailed(db, id, { error: FAILURE })

    const retried = await requeueOutbound(db, id)
    expect(retried.error).toBe(FAILURE)
  })

  it('is offered to the transmitter again, which is the point', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })
    await markFailed(db, id, { error: FAILURE })

    expect((await collectQueued(db, { limit: 10 })).map((row) => row.id)).not.toContain(id)

    await requeueOutbound(db, id)

    expect((await collectQueued(db, { limit: 10 })).map((row) => row.id)).toContain(id)
  })

  it('clears the error once it actually sends', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })
    await markFailed(db, id, { error: FAILURE })
    await requeueOutbound(db, id)
    await collectQueued(db, { limit: 10 })
    await markSent(db, id, { providerMessageId: 'smtp-1' })

    const sent = await getOutbound(db, id)
    expect(sent.status).toBe('sent')
    expect(sent.error).toBeNull()
    expect(sent.failedAt).toBeNull()
  })
})

describe('everything else refuses', () => {
  it('refuses a collected reply, because it may already be on the wire', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })

    await expect(requeueOutbound(db, id)).rejects.toThrow(/collected/i)
  })

  it('refuses a sent reply rather than mailing someone twice', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })
    await markSent(db, id)

    await expect(requeueOutbound(db, id)).rejects.toThrow(/already sent/i)
  })

  it('refuses one that is already queued', async () => {
    const id = await queueOne()
    await expect(requeueOutbound(db, id)).rejects.toThrow(/queued/i)
  })

  it('refuses an unknown id rather than inventing a row', async () => {
    await expect(requeueOutbound(db, 'nope')).rejects.toThrow(/not found/i)
  })
})

describe('retrying twice', () => {
  it('does not queue the same reply twice over', async () => {
    const id = await queueOne()
    await collectQueued(db, { limit: 10 })
    await markFailed(db, id, { error: FAILURE })

    await requeueOutbound(db, id)
    // The second click lands on a row that is already queued, and is refused —
    // so an impatient operator cannot produce two copies.
    await expect(requeueOutbound(db, id)).rejects.toThrow(/queued/i)

    const collected = await collectQueued(db, { limit: 10 })
    expect(collected.filter((row) => row.id === id)).toHaveLength(1)
  })
})
