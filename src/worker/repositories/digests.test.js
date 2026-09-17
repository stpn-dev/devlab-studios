import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from './testSupport/d1Sqlite.js'
import { deleteDigest, listDigests, listRecentSourceUrls, pruneDigests, saveDigest, setDigestStatus } from './digests.js'

const SCHEMA = readFileSync(new URL('../../../migrations/0011_insights_digest.sql', import.meta.url), 'utf8')

function items(count, prefix = 'a') {
  return Array.from({ length: count }, (_, index) => ({
    sourceName: 'Feed A',
    sourceUrl: `https://example.com/${prefix}-${index}`,
    title: `Story ${prefix}-${index}`,
    summary: `Summary ${index}`,
    publishedAt: '2026-09-17T05:00:00Z',
  }))
}

/** `date('now', ...)` is evaluated by SQLite, so test dates are anchored to its clock. */
function dateOffset(days) {
  const now = new Date()
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

describe('digest repository', () => {
  let db

  beforeEach(() => {
    db = createTestD1([SCHEMA])
  })

  it('saves a day and reads it back with its items in order', async () => {
    await saveDigest(db, { digestDate: dateOffset(0), items: items(3), model: '@cf/meta/llama-3.1-8b-instruct' })

    const [digest] = await listDigests(db)

    expect(digest.itemCount).toBe(3)
    expect(digest.model).toBe('@cf/meta/llama-3.1-8b-instruct')
    expect(digest.items.map((item) => item.title)).toEqual(['Story a-0', 'Story a-1', 'Story a-2'])
  })

  it('replaces a day rather than duplicating it when the run repeats', async () => {
    const today = dateOffset(0)
    await saveDigest(db, { digestDate: today, items: items(3), model: 'model-1' })
    await saveDigest(db, { digestDate: today, items: items(2, 'b'), model: 'model-2' })

    const digests = await listDigests(db)

    expect(digests).toHaveLength(1)
    expect(digests[0].itemCount).toBe(2)
    expect(digests[0].model).toBe('model-2')
    expect(digests[0].items.map((item) => item.title)).toEqual(['Story b-0', 'Story b-1'])
  })

  it('returns days newest first', async () => {
    await saveDigest(db, { digestDate: dateOffset(-2), items: items(1, 'old'), model: null })
    await saveDigest(db, { digestDate: dateOffset(0), items: items(1, 'new'), model: null })

    expect((await listDigests(db)).map((digest) => digest.digestDate)).toEqual([dateOffset(0), dateOffset(-2)])
  })

  it('hides unpublished days from the public listing but keeps them for the admin', async () => {
    await saveDigest(db, { digestDate: dateOffset(0), items: items(1), model: null })
    const [digest] = await listDigests(db)

    await setDigestStatus(db, digest.id, 'draft')

    expect(await listDigests(db)).toHaveLength(0)
    expect(await listDigests(db, { includeDrafts: true })).toHaveLength(1)
  })

  it('lists the source URLs published in the trailing window, and only those', async () => {
    await saveDigest(db, { digestDate: dateOffset(-1), items: items(1, 'recent'), model: null })
    await saveDigest(db, { digestDate: dateOffset(-30), items: items(1, 'ancient'), model: null })

    const urls = await listRecentSourceUrls(db, 7)

    expect(urls.has('https://example.com/recent-0')).toBe(true)
    expect(urls.has('https://example.com/ancient-0')).toBe(false)
  })

  it('prunes days past the retention window and keeps the one on the boundary', async () => {
    await saveDigest(db, { digestDate: dateOffset(-7), items: items(1, 'edge'), model: null })
    await saveDigest(db, { digestDate: dateOffset(-8), items: items(1, 'stale'), model: null })

    const pruned = await pruneDigests(db, 7)

    expect(pruned).toBe(1)
    expect((await listDigests(db)).map((digest) => digest.digestDate)).toEqual([dateOffset(-7)])
  })

  it('removes a deleted day’s items with it, rather than orphaning them', async () => {
    await saveDigest(db, { digestDate: dateOffset(0), items: items(3), model: null })
    const [digest] = await listDigests(db)

    await deleteDigest(db, digest.id)

    expect(await listDigests(db)).toHaveLength(0)
    expect(await listRecentSourceUrls(db, 7)).toEqual(new Set())
  })

  it('prunes items alongside the days they belonged to', async () => {
    await saveDigest(db, { digestDate: dateOffset(-30), items: items(4, 'ancient'), model: null })

    await pruneDigests(db, 7)

    expect(await listRecentSourceUrls(db, 3650)).toEqual(new Set())
  })

  it('returns an empty list rather than failing when nothing has been generated', async () => {
    expect(await listDigests(db)).toEqual([])
    expect(await listRecentSourceUrls(db, 7)).toEqual(new Set())
    expect(await pruneDigests(db, 7)).toBe(0)
  })
})
