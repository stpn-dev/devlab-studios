import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The feed fetch is the only part of the run that reaches the network, so it is
// the only thing stubbed. The repository runs against real SQLite and the
// selection rules run for real, which is the point of the test.
const fetchFeedItems = vi.hoisted(() => vi.fn())
vi.mock('./fetchFeed.js', () => ({ fetchFeedItems }))

const { createTestD1 } = await import('../repositories/testSupport/d1Sqlite.js')
const { listDigests, saveDigest } = await import('../repositories/digests.js')
const { digestDateFor, runDailyDigest } = await import('./runDigest.js')

const SCHEMA = readFileSync(new URL('../../../migrations/0011_insights_digest.sql', import.meta.url), 'utf8')
const NOW = new Date()

function feedItem(overrides = {}) {
  return {
    sourceName: 'Feed A',
    sourceUrl: 'https://example.com/story',
    title: 'A story',
    excerpt: 'Some excerpt.',
    publishedAt: NOW.toISOString(),
    ...overrides,
  }
}

function fakeAi() {
  return { run: vi.fn().mockResolvedValue({ response: 'A one-line summary.' }) }
}

function dateOffset(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

describe('runDailyDigest', () => {
  let db

  beforeEach(() => {
    db = createTestD1([SCHEMA])
    fetchFeedItems.mockReset()
  })

  it('fetches, summarizes and publishes the day', async () => {
    fetchFeedItems.mockResolvedValue([
      feedItem({ sourceUrl: 'https://example.com/a', title: 'Story A' }),
      feedItem({ sourceUrl: 'https://example.com/b', title: 'Story B' }),
    ])

    const result = await runDailyDigest({ DB: db, AI: fakeAi() }, { now: NOW })

    expect(result.published).toBe(true)
    expect(result.digestDate).toBe(digestDateFor(NOW))

    const [digest] = await listDigests(db)
    expect(digest.items.every((item) => item.summary === 'A one-line summary.')).toBe(true)
  })

  it('publishes titles and links when the AI binding is missing', async () => {
    fetchFeedItems.mockResolvedValue([feedItem({ sourceUrl: 'https://example.com/a', title: 'Story A' })])

    const result = await runDailyDigest({ DB: db }, { now: NOW })

    expect(result.published).toBe(true)
    expect(result.model).toBeNull()

    const [digest] = await listDigests(db)
    expect(digest.items[0].title).toBe('Story A')
    expect(digest.items[0].summary).toBe('')
  })

  it('never publishes more than the daily cap', async () => {
    fetchFeedItems.mockImplementation(async (feed) =>
      Array.from({ length: 6 }, (_, index) =>
        feedItem({ sourceName: feed.name, sourceUrl: `https://${encodeURIComponent(feed.name)}.example.com/${index}`, title: `${feed.name} ${index}` }),
      ),
    )

    const result = await runDailyDigest({ DB: db }, { now: NOW })

    expect(result.itemCount).toBe(10)
  })

  it('does not republish a story that already ran earlier in the week', async () => {
    await saveDigest(db, {
      digestDate: dateOffset(-1),
      items: [{ sourceName: 'Feed A', sourceUrl: 'https://example.com/yesterday', title: 'Yesterday', summary: '', publishedAt: null }],
      model: null,
    })
    fetchFeedItems.mockResolvedValue([
      feedItem({ sourceUrl: 'https://example.com/yesterday', title: 'Yesterday' }),
      feedItem({ sourceUrl: 'https://example.com/today', title: 'Today' }),
    ])

    const result = await runDailyDigest({ DB: db }, { now: NOW })

    expect(result.itemCount).toBe(1)
    const [latest] = await listDigests(db)
    expect(latest.items[0].title).toBe('Today')
  })

  it('republishes the same full edition when the run repeats on the same day', async () => {
    // "Generate now" pressed twice must not replace a full edition with the
    // leftovers, which is what happens if the day being generated counts
    // towards its own dedupe window.
    fetchFeedItems.mockResolvedValue([
      feedItem({ sourceUrl: 'https://example.com/a', title: 'Story A' }),
      feedItem({ sourceUrl: 'https://example.com/b', title: 'Story B' }),
    ])

    const first = await runDailyDigest({ DB: db }, { now: NOW })
    const second = await runDailyDigest({ DB: db }, { now: NOW })

    expect(first.itemCount).toBe(2)
    expect(second.itemCount).toBe(2)

    const digests = await listDigests(db)
    expect(digests).toHaveLength(1)
    expect(digests[0].items.map((item) => item.title)).toEqual(['Story A', 'Story B'])
  })

  it('leaves the previous edition in place when every feed fails', async () => {
    await saveDigest(db, {
      digestDate: dateOffset(-1),
      items: [{ sourceName: 'Feed A', sourceUrl: 'https://example.com/yesterday', title: 'Yesterday', summary: '', publishedAt: null }],
      model: null,
    })
    fetchFeedItems.mockResolvedValue([])

    const result = await runDailyDigest({ DB: db }, { now: NOW })

    expect(result.published).toBe(false)
    expect(result.reason).toBe('no_new_items')
    expect(await listDigests(db)).toHaveLength(1)
  })

  it('sweeps expired days even on a run that publishes nothing', async () => {
    await saveDigest(db, {
      digestDate: dateOffset(-30),
      items: [{ sourceName: 'Feed A', sourceUrl: 'https://example.com/ancient', title: 'Ancient', summary: '', publishedAt: null }],
      model: null,
    })
    fetchFeedItems.mockResolvedValue([])

    const result = await runDailyDigest({ DB: db }, { now: NOW })

    expect(result.published).toBe(false)
    expect(result.pruned).toBe(1)
    expect(await listDigests(db)).toHaveLength(0)
  })

  it('sweeps expired days on a run that publishes', async () => {
    await saveDigest(db, {
      digestDate: dateOffset(-30),
      items: [{ sourceName: 'Feed A', sourceUrl: 'https://example.com/ancient', title: 'Ancient', summary: '', publishedAt: null }],
      model: null,
    })
    fetchFeedItems.mockResolvedValue([feedItem({ sourceUrl: 'https://example.com/a', title: 'Story A' })])

    const result = await runDailyDigest({ DB: db }, { now: NOW })

    expect(result.pruned).toBe(1)
    expect((await listDigests(db)).map((digest) => digest.digestDate)).toEqual([digestDateFor(NOW)])
  })

  it('does nothing at all without a database binding', async () => {
    const result = await runDailyDigest({}, { now: NOW })

    expect(result).toMatchObject({ published: false, reason: 'no_database' })
    expect(fetchFeedItems).not.toHaveBeenCalled()
  })
})

describe('digestDateFor', () => {
  it('uses UTC, so the date does not depend on where it is read', () => {
    expect(digestDateFor(new Date('2026-09-17T23:30:00Z'))).toBe('2026-09-17')
    expect(digestDateFor(new Date('2026-09-18T00:30:00Z'))).toBe('2026-09-18')
  })
})
