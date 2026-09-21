/**
 * What the cron tick does.
 *
 * Invoked from `scheduled()` in src/worker.ts, alongside the existing Insights
 * digest. One entry point, ordered deliberately:
 *
 *   1. Maintenance — reclaim stranded jobs, so work lost to a dead Worker
 *      becomes visible and runnable again before anything else runs.
 *   2. Campaign schedules — only campaigns that are BOTH active and have their
 *      schedule armed.
 *   3. Drain — process whatever is now queued, bounded.
 *
 * There is no mailbox step. Polling a personal mailbox from a Worker's
 * rotating egress IPs is what got the provider account blocked; replies are
 * read by a person in their own client now.
 *
 * Nothing here activates anything. A campaign that nobody armed stays idle
 * forever, and with the feature flags at their shipped defaults this function
 * returns immediately.
 */

import { resolveFlags } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { dispatchJob } from './dispatch.js'
import { listScheduledCampaigns } from '../repositories/campaigns.js'
import { createLogger } from '../services/log.js'
import { drainJobs } from './runner.js'
import { utcDateKey } from '../repositories/helpers.js'


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
  const summary = { enqueued: 0, campaigns: 0 }

  try {
    await dispatchJob(env, {
      jobType: 'maintenance',
      payload: {},
      priority: 20,
      // One per day: reclaiming and pruning more often than that costs writes
      // and buys nothing.
      dedupeKey: `maintenance:${utcDateKey()}`,
    })


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
