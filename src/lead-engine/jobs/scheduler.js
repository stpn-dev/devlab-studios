/**
 * What the cron tick does.
 *
 * Invoked from `scheduled()` in src/worker.ts, alongside the existing Insights
 * digest. One entry point, ordered deliberately:
 *
 *   1. Maintenance — reclaim stranded jobs, so work lost to a dead Worker
 *      becomes visible and runnable again before anything else runs.
 *   2. Mailbox sync — enqueued FIRST among the real work, because a reply
 *      sitting unread is the most time-sensitive thing this system handles.
 *   3. Campaign schedules — only campaigns that are BOTH active and have their
 *      schedule armed.
 *   4. Drain — process whatever is now queued, bounded.
 *
 * Nothing here activates anything. A campaign that nobody armed stays idle
 * forever, and with the feature flags at their shipped defaults this function
 * returns immediately.
 */

import { resolveFlags } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { dispatchJob } from './dispatch.js'
import { listScheduledCampaigns } from '../repositories/campaigns.js'
import { getSyncState } from '../repositories/syncState.js'
import { readZohoConfig } from '../zoho/oauth.js'
import { createLogger } from '../services/log.js'
import { drainJobs } from './runner.js'
import { utcDateKey } from '../repositories/helpers.js'

/** Consecutive failures after which the mailbox is polled less often. */
const SYNC_BACKOFF_THRESHOLD = 5

/**
 * Whether a mailbox sync should be enqueued on this tick.
 *
 * Backs off after repeated failures rather than hammering a mailbox that is
 * refusing us — usually because the refresh token needs re-authorizing, which
 * no amount of retrying fixes.
 */
async function shouldSyncMailbox(db, mailbox) {
  const [inbox, sent] = await Promise.all([
    getSyncState(db, { mailbox, folder: 'inbox' }),
    getSyncState(db, { mailbox, folder: 'sent' }),
  ])

  const failures = Math.max(inbox?.consecutiveFailures ?? 0, sent?.consecutiveFailures ?? 0)
  if (failures < SYNC_BACKOFF_THRESHOLD) return true

  // Once backed off, try roughly once an hour instead of every tick.
  const lastAttempt = [inbox?.lastSyncAt, sent?.lastSyncAt].filter(Boolean).sort().pop()
  if (!lastAttempt) return true
  return Date.now() - new Date(lastAttempt).getTime() > 60 * 60 * 1000
}

/**
 * One scheduled tick.
 *
 * Contains its own failures: this runs inside the Worker's `scheduled()`
 * handler next to the Insights digest, and a thrown error there causes a retry
 * of the WHOLE scheduled invocation — including the digest, which must not be
 * re-run.
 *
 * @param {Env} env
 * @param {{ now?: Date, trigger?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function runScheduledTick(env, options = {}) {
  env = await withOperationalFlags(env)
  const flags = resolveFlags(env)
  const logger = createLogger({})

  if (!flags.engine) return { status: 'disabled' }
  if (!env?.DB) return { status: 'no_database' }

  const db = env.DB
  const summary = { enqueued: 0, campaigns: 0, mailboxSync: false }

  try {
    await dispatchJob(env, {
      jobType: 'maintenance',
      payload: {},
      priority: 20,
      // One per day: reclaiming and pruning more often than that costs writes
      // and buys nothing.
      dedupeKey: `maintenance:${utcDateKey()}`,
    })

    if (flags.zohoMailSync) {
      const config = readZohoConfig(env)
      if (config.isConfigured && (await shouldSyncMailbox(db, config.userEmail))) {
        const { created } = await dispatchJob(env, {
          jobType: 'mailbox_sync',
          payload: { mailbox: config.userEmail },
          priority: 15,
          // One outstanding sync at a time. A second would read the same window
          // and import nothing.
          dedupeKey: 'mailbox_sync',
        })
        summary.mailboxSync = created
        if (created) summary.enqueued += 1
      }
    }

    if (flags.discovery && flags.campaignSchedules) {
      // BOTH switches, on both the flag and the campaign. Neither this
      // function nor anything else promotes a campaign into this list.
      const campaigns = await listScheduledCampaigns(db)
      summary.campaigns = campaigns.length

      for (const campaign of campaigns) {
        const { created } = await dispatchJob(env, {
          jobType: 'campaign_discovery',
          campaignId: campaign.id,
          payload: { campaignId: campaign.id },
          priority: 5,
          // One discovery run per campaign per day.
          dedupeKey: `campaign_discovery:${campaign.id}:${utcDateKey(options.now)}`,
        })
        if (created) summary.enqueued += 1
      }
    }

    const drained = await drainJobs(env, {
      fetchImpl: options.fetchImpl,
      correlationId: logger.correlationId,
    })

    logger.log('scheduled_tick', { result: 'ok', trigger: options.trigger || 'cron', ...summary, ...drained })
    return { status: 'ok', ...summary, ...drained }
  } catch (error) {
    // Logged and swallowed. See the note above: throwing here would retry the
    // whole scheduled invocation, digest included.
    logger.log('scheduled_tick', {
      result: 'error',
      trigger: options.trigger || 'cron',
      error: error instanceof Error ? error.message : 'unknown',
    })
    return { status: 'error', error: error instanceof Error ? error.message : 'unknown' }
  }
}
