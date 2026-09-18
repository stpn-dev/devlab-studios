/**
 * Job handlers: the business logic behind each job type.
 *
 * Deliberately NOT inside a Workflow class or a queue consumer. Both of those
 * are execution substrates, and putting the logic in them would make it
 * testable only through them — and unusable from the admin's "run this now"
 * button. Each handler here is an ordinary async function over `(env, payload)`
 * that the D1 runner, a Cloudflare Workflow step and a queue consumer all call
 * identically.
 *
 * A handler returns `{ retryable }` on failure so the runner can distinguish a
 * transient problem from a permanent one. Retrying a robots.txt disallow three
 * times helps nobody and hits someone else's server twice more than necessary.
 */

import { FeatureDisabledError } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { STAGES } from '../domain/pipeline.js'
import { runCampaignDiscovery } from '../services/discovery.js'
import { researchLead } from '../services/research.js'
import { reviewLeadOpportunity } from '../services/aiReview.js'
import { generateOutreachDraft } from '../services/outreach.js'
import { syncMailbox } from '../services/mailboxSync.js'
import { processInboundReply } from '../services/replyCopilot.js'
import { pruneCompletedJobs, reclaimStaleJobs } from '../repositories/jobs.js'
import { dispatchJob } from './dispatch.js'
import { listLeadsInStage } from '../repositories/leads.js'

/**
 * Errors that will not resolve themselves.
 *
 * A disabled feature, a missing lead and a refused Zoho authorization all need
 * a human; retrying them burns attempts and obscures the real problem on the
 * failed-jobs screen.
 */
function isPermanent(error) {
  if (error instanceof FeatureDisabledError) return true
  if (error?.code === 'zoho_reauthorization_required') return true
  if (error?.code === 'zoho_not_configured') return true
  if (error?.retryable === false) return true

  const status = Number(error?.status)
  // 4xx other than 408/429 means the request itself was wrong.
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * Each handler receives `(env, job, options)` and returns an outcome object.
 * Throwing is also fine — the runner catches and classifies.
 */
export const JOB_HANDLERS = Object.freeze({
  /**
   * Discovers candidates for one campaign and enqueues research for each new
   * lead.
   */
  async campaign_discovery(env, job, options = {}) {
    return runCampaignDiscovery(env, job.campaignId || job.payload.campaignId, {
      fetchImpl: options.fetchImpl,
      limit: job.payload.limit,
      correlationId: job.correlationId,
    })
  },

  /**
   * Crawls, extracts, scores and routes one lead, then enqueues AI review when
   * the rules qualified it.
   */
  async lead_research(env, job, options = {}) {
    const leadId = job.leadId || job.payload.leadId
    const result = await researchLead(env, leadId, {
      fetchImpl: options.fetchImpl,
      correlationId: job.correlationId,
    })

    if (result.routesToAi) {
      await dispatchJob(env, {
        jobType: 'ai_review',
        campaignId: job.campaignId,
        leadId,
        payload: { leadId },
        // Priority mirrors the scoring band, so a 90-scoring lead is reviewed
        // before a 61-scoring one when the day's AI budget is tight.
        priority: result.routing === 'priority_ai_review' ? 10 : 0,
        dedupeKey: `ai_review:${leadId}`,
        correlationId: job.correlationId,
      })
    }

    return result
  },

  /**
   * Reviews one lead with Workers AI, then enqueues draft generation when it
   * qualified and has a contact.
   */
  async ai_review(env, job, options = {}) {
    const leadId = job.leadId || job.payload.leadId
    const result = await reviewLeadOpportunity(env, leadId, { correlationId: job.correlationId })

    if (result.status === 'qualified' && result.hasContact) {
      await dispatchJob(env, {
        jobType: 'outreach_draft',
        campaignId: job.campaignId,
        leadId,
        payload: { leadId },
        dedupeKey: `outreach_draft:${leadId}`,
        correlationId: job.correlationId,
      })
    }

    // A deferred review is not a failure: the daily budget ran out, and the
    // job is re-enqueued for tomorrow rather than retried into the same wall.
    if (result.status === 'deferred') {
      await dispatchJob(env, {
        jobType: 'ai_review',
        campaignId: job.campaignId,
        leadId,
        payload: { leadId },
        delaySeconds: 6 * 60 * 60,
        dedupeKey: `ai_review_retry:${leadId}:${new Date().toISOString().slice(0, 10)}`,
        correlationId: job.correlationId,
      })
    }

    void options
    return result
  },

  /** Generates the suggested outreach draft, subject to the six-condition gate. */
  async outreach_draft(env, job) {
    return generateOutreachDraft(env, job.leadId || job.payload.leadId, { correlationId: job.correlationId })
  },

  /**
   * Synchronizes the Zoho Inbox and Sent folders, then enqueues analysis for
   * each inbound reply that needs it.
   */
  async mailbox_sync(env, job, options = {}) {
    const result = await syncMailbox(env, {
      fetchImpl: options.fetchImpl,
      correlationId: job.correlationId,
    })

    // Replies are found by querying for the state the sync just produced,
    // rather than by the sync returning them — so a sync that half-completed
    // still gets its replies analysed on the next tick.
    const replied = await listLeadsInStage(env.DB, STAGES.REPLIED, { limit: 25 })
    for (const lead of replied) {
      const message = await env.DB
        .prepare(
          `SELECT m.id FROM lead_messages m
           WHERE m.lead_id = ? AND m.direction = 'inbound' AND m.ai_summary IS NULL
           ORDER BY m.created_at DESC LIMIT 1`,
        )
        .bind(lead.id)
        .first()

      if (message) {
        await dispatchJob(env, {
          jobType: 'reply_analysis',
          leadId: lead.id,
          payload: { messageId: message.id },
          dedupeKey: `reply_analysis:${message.id}`,
          correlationId: job.correlationId,
        })
      }
    }

    return result
  },

  /** Analyses one inbound reply and drafts a suggested response. */
  async reply_analysis(env, job) {
    return processInboundReply(env, job.payload.messageId, { correlationId: job.correlationId })
  },

  /**
   * Housekeeping: reclaims stranded jobs and prunes the completed ones.
   *
   * Dead-lettered jobs are never pruned — they are the record of what failed
   * and the thing an operator retries.
   */
  async maintenance(env) {
    const reclaimed = await reclaimStaleJobs(env.DB)
    const pruned = await pruneCompletedJobs(env.DB)
    return { reclaimed, pruned }
  },
})

/**
 * Runs one job and classifies its outcome.
 *
 * Never throws. The runner needs a decision — complete, retry, or dead-letter —
 * for every job, including one whose handler crashed.
 *
 * @param {Env} env
 * @param {object} job
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ ok: boolean, result?: unknown, error?: string, retryable?: boolean }>}
 */
export async function runJob(env, job, options = {}) {
  env = await withOperationalFlags(env)
  const handler = JOB_HANDLERS[job.jobType]
  if (!handler) {
    return { ok: false, error: `No handler for job type "${job.jobType}".`, retryable: false }
  }

  try {
    const result = await handler(env, job, options)
    return { ok: true, result }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Job failed.',
      retryable: !isPermanent(error),
    }
  }
}
