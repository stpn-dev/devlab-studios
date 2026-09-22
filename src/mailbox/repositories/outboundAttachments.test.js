import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import { MAX_TOTAL_ATTACHMENT_BYTES } from '../domain/attachmentSources.js'
import {
  claimOutboundAttachments,
  createOutboundAttachment,
  deleteUnclaimedAttachment,
  listOutboundAttachments,
} from './outboundAttachments.js'
import { queueOutbound } from './outbound.js'
import { createThread } from './threads.js'

/**
 * Uploads become attachments in two steps, and the seam between them is where
 * the interesting failures live: an upload exists before the message does, so
 * something has to bind them, and that something must not be able to bind the
 * same bytes to two messages.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations')
const schema = [
  readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0013_lead_usage_metric_nominatim.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0015_mailbox_drafts.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0016_mailbox_outbound_attachments.sql'), 'utf8'),
]

let db
let threadId

beforeEach(async () => {
  db = createTestD1(schema)
  const thread = await createThread(db, {
    mailbox: 'hello',
    subject: 'Proposal',
    correspondent: 'someone@example.com',
  })
  threadId = thread.id
})

async function anOutbound() {
  const id = crypto.randomUUID()
  await queueOutbound(db, {
    id,
    threadId,
    mailbox: 'hello',
    toAddress: 'someone@example.com',
    subject: 'Proposal',
    bodyText: 'Attached.',
    messageId: `m.o-${id}.abc@devlabconnect.com`,
    envelopeFrom: `bounce+o-${id}@devlabconnect.com`,
  })
  return id
}

const anUpload = (overrides = {}) =>
  createOutboundAttachment(db, {
    filename: 'proposal.pdf',
    contentType: 'application/pdf',
    size: 1024,
    r2Key: `mailbox/out/${crypto.randomUUID()}`,
    ...overrides,
  })

describe('an upload before it is sent', () => {
  it('starts unclaimed, belonging to no message', async () => {
    const attachment = await anUpload()
    expect(attachment.outboundId).toBeNull()
    expect(attachment.source).toBe('upload')
  })

  it('refuses a source outside the known vocabulary', async () => {
    await expect(anUpload({ source: 'dropbox' })).rejects.toThrow(/unknown attachment source/i)
  })

  it('can be removed while nobody has sent it', async () => {
    const attachment = await anUpload()
    await deleteUnclaimedAttachment(db, attachment.id)
    await expect(deleteUnclaimedAttachment(db, attachment.id)).rejects.toThrow(/not found/i)
  })
})

describe('claiming', () => {
  it('binds uploads to the message, in the order they were added', async () => {
    const first = await anUpload({ filename: 'a.pdf' })
    const second = await anUpload({ filename: 'b.pdf' })
    const outboundId = await anOutbound()

    const claimed = await claimOutboundAttachments(db, { ids: [first.id, second.id], outboundId })

    expect(claimed.map((row) => row.filename)).toEqual(['a.pdf', 'b.pdf'])
    expect(claimed.every((row) => row.outboundId === outboundId)).toBe(true)
  })

  it('cannot bind the same upload to two messages', async () => {
    const attachment = await anUpload()
    const first = await anOutbound()
    const second = await anOutbound()

    await claimOutboundAttachments(db, { ids: [attachment.id], outboundId: first })

    await expect(
      claimOutboundAttachments(db, { ids: [attachment.id], outboundId: second }),
    ).rejects.toThrow(/already been sent/i)

    // And the first message still has it — the refusal did not detach anything.
    expect(await listOutboundAttachments(db, first)).toHaveLength(1)
    expect(await listOutboundAttachments(db, second)).toHaveLength(0)
  })

  it('refuses the whole set when one attachment is missing', async () => {
    // Partial attachment is the worst outcome: the operator believes the
    // recipient has everything, and the delivered message does not say
    // otherwise.
    const attachment = await anUpload()
    const outboundId = await anOutbound()

    await expect(
      claimOutboundAttachments(db, { ids: [attachment.id, 'does-not-exist'], outboundId }),
    ).rejects.toThrow(/no longer exists/i)

    expect(await listOutboundAttachments(db, outboundId)).toHaveLength(0)
  })

  it('refuses a set over the size limit rather than letting the MTA reject it', async () => {
    const big = await anUpload({ filename: 'huge.pdf', size: MAX_TOTAL_ATTACHMENT_BYTES })
    const extra = await anUpload({ filename: 'one-more.pdf', size: 1 })
    const outboundId = await anOutbound()

    await expect(
      claimOutboundAttachments(db, { ids: [big.id, extra.id], outboundId }),
    ).rejects.toThrow(/limit is 10 MB/i)

    expect(await listOutboundAttachments(db, outboundId)).toHaveLength(0)
  })

  it('refuses more attachments than a message should carry', async () => {
    const ids = []
    for (let index = 0; index < 11; index += 1) {
      ids.push((await anUpload({ filename: `f${index}.pdf` })).id)
    }
    await expect(claimOutboundAttachments(db, { ids, outboundId: await anOutbound() })).rejects.toThrow(
      /at most 10 attachments/i,
    )
  })

  it('refuses the same id listed twice, which would double the real size', async () => {
    const attachment = await anUpload()
    await expect(
      claimOutboundAttachments(db, { ids: [attachment.id, attachment.id], outboundId: await anOutbound() }),
    ).rejects.toThrow(/listed twice/i)
  })

  it('treats an empty list as no attachments rather than an error', async () => {
    expect(await claimOutboundAttachments(db, { ids: [], outboundId: await anOutbound() })).toEqual([])
  })
})

describe('after it has been sent', () => {
  it('cannot be removed, because the record must match what the recipient holds', async () => {
    const attachment = await anUpload()
    await claimOutboundAttachments(db, { ids: [attachment.id], outboundId: await anOutbound() })

    await expect(deleteUnclaimedAttachment(db, attachment.id)).rejects.toThrow(/already been sent/i)
  })

  it('is removed with the message it belongs to', async () => {
    const attachment = await anUpload()
    const outboundId = await anOutbound()
    await claimOutboundAttachments(db, { ids: [attachment.id], outboundId })

    await db.prepare('DELETE FROM mailbox_outbound WHERE id = ?').bind(outboundId).run()

    expect(await listOutboundAttachments(db, outboundId)).toHaveLength(0)
  })
})
