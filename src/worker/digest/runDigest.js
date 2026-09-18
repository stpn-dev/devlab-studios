import { DIGEST_FEEDS, RETENTION_DAYS } from './feeds.js'
import { fetchFeedItems } from './fetchFeed.js'
import { selectItems } from './select.js'
import { summarizeItems } from './summarize.js'
import { listRecentSourceUrls, pruneDigests, saveDigest } from '../repositories/digests.js'

/**
 * The daily run: fetch → dedupe → summarize → publish → sweep.
 *
 * One pass, one invocation. Every stage degrades rather than aborts — a dead
 * feed, an exhausted AI allocation or a slow source costs that stage's output
 * and nothing else, because a partial digest is useful and a missing one is not.
 *
 * The one thing that is NOT best-effort is the retention sweep: it runs even
 * when the rest of the run produced nothing, so a week of failed runs still
 * leaves the table bounded.
 */

/** UTC, so the digest date does not shift with whoever is looking at it. */
export function digestDateFor(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function log(fields) {
  console.log(JSON.stringify({ event: 'digest_run', ...fields }))
}

/**
 * @param {{ DB: import('@cloudflare/workers-types').D1Database, AI?: unknown }} env
 */
export async function runDailyDigest(env, { now = new Date(), trigger = 'cron' } = {}) {
  const startedAt = Date.now()
  const digestDate = digestDateFor(now)

  if (!env?.DB) {
    log({ outcome: 'skipped', reason: 'no_database', trigger })
    return { digestDate, itemCount: 0, published: false, reason: 'no_database' }
  }

  // Feeds are independent, so they go out together. `fetchFeedItems` never
  // throws, which is why this is `Promise.all` and not `allSettled`.
  const fetched = (await Promise.all(DIGEST_FEEDS.map((feed) => fetchFeedItems(feed)))).flat()

  // The day being generated is excluded from its own dedupe window, so a
  // re-run reconsiders the same candidates instead of publishing the leftovers.
  const alreadyPublished = await listRecentSourceUrls(env.DB, RETENTION_DAYS, { excludeDate: digestDate }).catch(
    () => new Set(),
  )
  const candidates = selectItems(fetched, { alreadyPublished, now })

  if (candidates.length === 0) {
    // Nothing new today. Yesterday's digest stays up rather than being replaced
    // by an empty section, but retention still runs.
    const pruned = await pruneDigests(env.DB, RETENTION_DAYS).catch(() => 0)
    log({ outcome: 'empty', digestDate, fetched: fetched.length, pruned, trigger })
    return { digestDate, itemCount: 0, published: false, reason: 'no_new_items', pruned }
  }

  const { items, model, neurons, summarized, failed, empty } = await summarizeItems(env.AI, candidates)
  await saveDigest(env.DB, { digestDate, items, model })
  const pruned = await pruneDigests(env.DB, RETENTION_DAYS).catch(() => 0)

  log({
    outcome: 'published',
    digestDate,
    fetched: fetched.length,
    itemCount: items.length,
    summarized,
    // Split on purpose: `failed` is the model refusing or the allocation being
    // spent, `empty` is a call that returned something we could not read. The
    // first production run was entirely `empty` while reporting "AI
    // unavailable", which sent the diagnosis in the wrong direction.
    failed,
    empty,
    model,
    // Budget telemetry. The included allowance is 10,000 neurons/day and a run
    // costs a few dozen, but "a few dozen" should be measured, not assumed.
    neurons,
    pruned,
    durationMs: Date.now() - startedAt,
    trigger,
  })

  return { digestDate, itemCount: items.length, published: true, model, neurons, summarized, pruned }
}
