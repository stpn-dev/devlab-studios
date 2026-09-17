import { describe, expect, it } from 'vitest'
import { selectItems } from './select.js'
import { MAX_ITEM_AGE_DAYS, MAX_ITEMS_PER_DIGEST } from './feeds.js'

const NOW = new Date('2026-09-17T06:00:00Z')

function item(overrides = {}) {
  return {
    sourceName: 'Feed A',
    sourceUrl: 'https://example.com/story',
    title: 'A story',
    excerpt: '',
    publishedAt: '2026-09-17T05:00:00Z',
    ...overrides,
  }
}

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe('selectItems', () => {
  it('keeps fresh, distinct items', () => {
    const selected = selectItems(
      [item({ sourceUrl: 'https://example.com/a', title: 'A' }), item({ sourceUrl: 'https://example.com/b', title: 'B' })],
      { now: NOW },
    )

    expect(selected.map((entry) => entry.title)).toEqual(['A', 'B'])
  })

  it('never publishes more than the daily cap', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      item({ sourceName: `Feed ${index % 5}`, sourceUrl: `https://example.com/${index}`, title: `Story ${index}` }),
    )

    expect(selectItems(many, { now: NOW })).toHaveLength(MAX_ITEMS_PER_DIGEST)
  })

  it('skips anything already published in the trailing window', () => {
    const selected = selectItems(
      [item({ sourceUrl: 'https://example.com/old', title: 'Old' }), item({ sourceUrl: 'https://example.com/new', title: 'New' })],
      { now: NOW, alreadyPublished: new Set(['https://example.com/old']) },
    )

    expect(selected.map((entry) => entry.title)).toEqual(['New'])
  })

  it('treats tracking parameters, trailing slashes and www as the same story', () => {
    const selected = selectItems(
      [item({ sourceUrl: 'https://www.example.com/story/?utm_source=rss', title: 'Same story' })],
      { now: NOW, alreadyPublished: new Set(['https://example.com/story']) },
    )

    expect(selected).toEqual([])
  })

  it('drops a second copy of the same headline syndicated by another source', () => {
    const selected = selectItems(
      [
        item({ sourceName: 'Feed A', sourceUrl: 'https://a.example.com/1', title: 'OpenAI ships a new model' }),
        item({ sourceName: 'Feed B', sourceUrl: 'https://b.example.com/2', title: 'OpenAI ships a new model!' }),
      ],
      { now: NOW },
    )

    expect(selected).toHaveLength(1)
  })

  it('drops items older than the freshness window but keeps one at the boundary', () => {
    const selected = selectItems(
      [
        item({ sourceUrl: 'https://example.com/edge', title: 'Edge', publishedAt: daysAgo(MAX_ITEM_AGE_DAYS) }),
        item({ sourceUrl: 'https://example.com/stale', title: 'Stale', publishedAt: daysAgo(MAX_ITEM_AGE_DAYS + 1) }),
      ],
      { now: NOW },
    )

    expect(selected.map((entry) => entry.title)).toEqual(['Edge'])
  })

  it('keeps items with a missing or unparseable date rather than guessing', () => {
    const selected = selectItems(
      [
        item({ sourceUrl: 'https://example.com/undated', title: 'Undated', publishedAt: null }),
        item({ sourceUrl: 'https://example.com/garbage', title: 'Garbage date', publishedAt: 'not a date' }),
      ],
      { now: NOW },
    )

    expect(selected).toHaveLength(2)
  })

  it('interleaves sources so one busy feed cannot take the whole day', () => {
    const busy = Array.from({ length: 12 }, (_, index) =>
      item({ sourceName: 'Busy', sourceUrl: `https://busy.example.com/${index}`, title: `Busy ${index}` }),
    )
    const quiet = [item({ sourceName: 'Quiet', sourceUrl: 'https://quiet.example.com/1', title: 'Quiet 1' })]

    const selected = selectItems([...busy, ...quiet], { now: NOW })
    const sources = selected.map((entry) => entry.sourceName)

    expect(sources).toContain('Quiet')
    expect(sources[0]).toBe('Busy')
    expect(sources[1]).toBe('Quiet')
  })

  it('orders each source newest first', () => {
    const selected = selectItems(
      [
        item({ sourceUrl: 'https://example.com/older', title: 'Older', publishedAt: daysAgo(2) }),
        item({ sourceUrl: 'https://example.com/newer', title: 'Newer', publishedAt: daysAgo(1) }),
      ],
      { now: NOW },
    )

    expect(selected.map((entry) => entry.title)).toEqual(['Newer', 'Older'])
  })

  it('returns nothing when every candidate has already been published', () => {
    const selected = selectItems([item({ sourceUrl: 'https://example.com/a' })], {
      now: NOW,
      alreadyPublished: new Set(['https://example.com/a']),
    })

    expect(selected).toEqual([])
  })
})
