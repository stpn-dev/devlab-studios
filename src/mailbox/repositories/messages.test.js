import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import { createThread } from './threads.js'
import { insertMessage, listMessagesForThread } from './messages.js'

/**
 * The idempotency guarantee, at the level where it is actually implemented.
 *
 * `insertMessage` has two defences against storing a message twice, and they
 * cover different situations:
 *
 *   1. A pre-check on `dedupe_key`, which handles a REDELIVERY — the common
 *      case, and the one ingest.test.js covers end to end.
 *   2. A caught UNIQUE violation, which handles a genuine RACE: two deliveries
 *      of the same message where both pass the pre-check before either commits.
 *
 * Only the second is load-bearing under concurrency, and it is the one that is
 * easy to believe is working without ever having run. It cannot be reached by
 * calling `ingestEmail` twice through the D1 test double — that runs a single
 * synchronous SQLite connection, so two interleaved `batch()` calls fail with
 * "cannot start a transaction within a transaction", which is a property of the
 * double and not of D1. So the race is reproduced here directly, by making the
 * pre-check miss a row that is really there.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations')
const schema = [
  readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0013_lead_usage_metric_nominatim.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8'),
]

const DEDUPE_KEY = 'hello:CAJane123@mail.prospect.example'

function baseMessage(threadId) {
  return {
    threadId,
    mailbox: 'hello',
    direction: 'inbound',
    dedupeKey: DEDUPE_KEY,
    envelopeFrom: 'jane@prospect.example',
    envelopeTo: 'hello@devlabconnect.com',
    messageId: 'CAJane123@mail.prospect.example',
    fromAddress: 'jane@prospect.example',
    subject: 'A question',
    bodyText: 'Hello there.',
    receivedAt: '2026-09-20T12:00:00.000Z',
  }
}

/**
 * Wraps the database so the FIRST dedupe-key lookup reports nothing, exactly as
 * it would for the loser of a real race, while the row is already committed.
 */
function withBlindPreCheck(db) {
  let blinded = false

  return {
    prepare(sql) {
      const statement = db.prepare(sql)
      if (!sql.includes('WHERE dedupe_key = ?')) return statement

      return {
        bind(...args) {
          const bound = statement.bind(...args)
          return {
            ...bound,
            all: () => bound.all(),
            run: () => bound.run(),
            async first() {
              if (!blinded) {
                blinded = true
                return null
              }
              return bound.first()
            },
          }
        },
      }
    },
    batch: (statements) => db.batch(statements),
  }
}

let db
let threadId

beforeEach(async () => {
  db = createTestD1(schema)
  const thread = await createThread(db, {
    mailbox: 'hello',
    subject: 'A question',
    correspondent: 'jane@prospect.example',
  })
  threadId = thread.id
})

describe('insertMessage idempotency', () => {
  it('stores a new message once', async () => {
    const result = await insertMessage(db, baseMessage(threadId))

    expect(result.created).toBe(true)
    expect(await listMessagesForThread(db, threadId)).toHaveLength(1)
  })

  it('recognises a redelivery through the pre-check', async () => {
    await insertMessage(db, baseMessage(threadId))
    const second = await insertMessage(db, baseMessage(threadId))

    expect(second.created).toBe(false)
    expect(second.message.dedupeKey ?? DEDUPE_KEY).toBe(DEDUPE_KEY)
    expect(await listMessagesForThread(db, threadId)).toHaveLength(1)
  })

  it('resolves a lost race to the winner rather than failing the delivery', async () => {
    // The winner commits first.
    const winner = await insertMessage(db, baseMessage(threadId))
    expect(winner.created).toBe(true)

    // The loser's pre-check misses it, so its INSERT hits the UNIQUE index.
    // Without the caught violation this would throw, the ingest would fail, and
    // the sending MTA would be told to retry a message we already have.
    const loser = await insertMessage(withBlindPreCheck(db), baseMessage(threadId))

    expect(loser.created).toBe(false)
    expect(loser.message.id).toBe(winner.message.id)

    // And the rollups were not double-counted, because the whole batch rolled
    // back — message_count stays at one.
    expect(await listMessagesForThread(db, threadId)).toHaveLength(1)
    const thread = await db.prepare('SELECT message_count FROM mailbox_threads WHERE id = ?').bind(threadId).first()
    expect(Number(thread.message_count)).toBe(1)
  })

  it('lets a real constraint violation surface instead of hiding it', async () => {
    // The counterpart guarantee. `direction` has a CHECK, and the mailbox uses
    // a plain INSERT precisely so a bad value raises rather than vanishing —
    // which is what `INSERT OR IGNORE` did three times in this schema.
    await expect(
      insertMessage(db, { ...baseMessage(threadId), direction: 'sideways', dedupeKey: 'hello:other' }),
    ).rejects.toThrow(/CHECK constraint failed/i)

    expect(await listMessagesForThread(db, threadId)).toHaveLength(0)
  })
})
