import { MAX_ITEM_AGE_DAYS, MAX_ITEMS_PER_DIGEST } from './feeds.js'

/**
 * Choosing the day's ten items from everything the feeds returned.
 *
 * Pure and synchronous on purpose: this is the part of the run with real rules
 * in it (freshness, deduplication, source balance), so it is the part worth
 * testing directly, without network or AI in the way.
 */

/** Same story, different URL: feeds append tracking and AMP suffixes freely. */
function canonicalUrl(url) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    parsed.protocol = 'https:'
    parsed.hostname = parsed.hostname.replace(/^www\./, '')
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.toString().toLowerCase()
  } catch {
    return String(url || '').trim().toLowerCase()
  }
}

/** Titles are compared loosely: the same story is syndicated under near-identical headlines. */
function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFresh(item, now) {
  // An item without a usable date still counts: plenty of feeds omit one, and
  // the per-feed cap already keeps a single source from flooding the day.
  if (!item.publishedAt) return true
  const published = new Date(item.publishedAt).getTime()
  if (Number.isNaN(published)) return true
  const ageDays = (now.getTime() - published) / 86_400_000
  // Future-dated items are kept: a feed a few hours ahead of us is common, and
  // a clock skew is not a reason to drop today's news.
  return ageDays <= MAX_ITEM_AGE_DAYS
}

function byNewest(a, b) {
  return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
}

/**
 * @param {Array<{sourceName: string, sourceUrl: string, title: string, excerpt: string, publishedAt: string|null}>} items
 * @param {{ alreadyPublished?: Set<string>, now?: Date, limit?: number }} options
 */
export function selectItems(items, { alreadyPublished = new Set(), now = new Date(), limit = MAX_ITEMS_PER_DIGEST } = {}) {
  const publishedKeys = new Set([...alreadyPublished].map(canonicalUrl))
  const seenUrls = new Set()
  const seenTitles = new Set()

  // Group by source first so the round-robin below can interleave them. A
  // straight "newest ten" would hand the whole day to whichever feed happens to
  // publish most often.
  const bySource = new Map()
  for (const item of items) {
    if (!isFresh(item, now)) continue

    const urlKey = canonicalUrl(item.sourceUrl)
    if (publishedKeys.has(urlKey) || seenUrls.has(urlKey)) continue

    const key = titleKey(item.title)
    if (!key || seenTitles.has(key)) continue

    seenUrls.add(urlKey)
    seenTitles.add(key)

    if (!bySource.has(item.sourceName)) bySource.set(item.sourceName, [])
    bySource.get(item.sourceName).push(item)
  }

  const queues = [...bySource.values()].map((sourceItems) => [...sourceItems].sort(byNewest))
  const selected = []

  // Round-robin: one from each source, then the next from each, until full.
  while (selected.length < limit) {
    const before = selected.length
    for (const queue of queues) {
      if (selected.length >= limit) break
      const next = queue.shift()
      if (next) selected.push(next)
    }
    if (selected.length === before) break
  }

  return selected
}
