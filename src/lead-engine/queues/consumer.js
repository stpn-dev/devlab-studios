/**
 * Cloudflare Queues consumer.
 *
 * Calls the same `runJob` the D1 runner and the Workflows use, so the three
 * substrates cannot drift. What Queues add is fan-out and throttling: a
 * discovery run producing a hundred leads can hand a hundred research messages
 * to a queue with `max_concurrency` set, instead of draining them ten per cron
 * tick.
 *
 * MESSAGES CARRY IDS, NEVER DOCUMENTS. Every payload here is
 * `{ jobId }` or `{ jobType, leadId }`, and the handler re-reads from D1. A
 * queue message containing page HTML or an email body would put content in a
 * transient system that D1 is supposed to own, and would blow the message size
 * limit on the first large page.
 *
 * `ack()` and `retry()` are explicit on every path. A message that is neither
 * acked nor retried is redelivered after the visibility timeout, which turns a
 * silent bug into duplicated work — survivable here, because import and lead
 * creation are idempotent, but not something to rely on.
 *
 * NOT YET BOUND: `wrangler.jsonc` has the `queues` block commented out with its
 * activation steps, because a binding naming a queue that does not exist fails
 * `wrangler deploy` for the entire Worker. See docs/lead-engine/queues.md.
 */

import { resolveFlags } from '../config/flags.js'
import { runJob } from '../jobs/handlers.js'
import { completeJob, failJob, getJob } from '../repositories/jobs.js'
import { createLogger } from '../services/log.js'

/**
 * Handles one batch.
 *
 * @param {{ messages: Array<{ body: object, ack: Function, retry: Function, attempts?: number }>, queue: string }} batch
 * @param {Record<string, unknown>} env
 */
export async function handleQueueBatch(batch, env) {
  const logger = createLogger({})
  const flags = resolveFlags(env)

  if (!flags.engine) {
    // The engine is off. Acked rather than retried: retrying would redeliver
    // the same messages every visibility timeout until someone turns the engine
    // back on, and the work is re-enqueueable from D1 anyway.
    for (const message of batch.messages) message.ack()
    logger.log('queue_batch_skipped', { result: 'engine_disabled', queue: batch.queue, messages: batch.messages.length })
    return
  }

  for (const message of batch.messages) {
    const payload = message.body || {}
    const attempts = message.attempts ?? 1

    // A message referencing a job row: the row is authoritative, so a job that
    // was cancelled or already succeeded between enqueue and delivery is
    // acked without re-running.
    let job = payload.jobId ? await getJob(env.DB, payload.jobId) : null

    if (payload.jobId && !job) {
      message.ack()
      continue
    }

    if (job && (job.status === 'succeeded' || job.status === 'cancelled')) {
      message.ack()
      continue
    }

    if (!job) {
      job = {
        id: null,
        jobType: payload.jobType,
        campaignId: payload.campaignId ?? null,
        leadId: payload.leadId ?? null,
        payload: payload.payload ?? payload,
        correlationId: payload.correlationId ?? logger.correlationId,
        attempts,
      }
    }

    const startedAt = Date.now()
    const outcome = await runJob(env, job)

    if (outcome.ok) {
      if (job.id) await completeJob(env.DB, job.id)
      message.ack()
      logger.log('queue_message_completed', {
        queue: batch.queue,
        stage: job.jobType,
        result: 'ok',
        duration_ms: Date.now() - startedAt,
        attempts,
      })
      continue
    }

    if (job.id) {
      await failJob(env.DB, job.id, { error: outcome.error, retryable: outcome.retryable })
    }

    if (outcome.retryable) {
      // Let the queue redeliver with its own backoff; the job row already
      // carries the attempt count and the error for the admin screen.
      message.retry()
    } else {
      // Acked, not retried. The failure is permanent and the job row is now
      // dead-lettered, which is where a human will see it — redelivering it
      // would just repeat the same permanent failure until the queue's own
      // dead-letter limit.
      message.ack()
    }

    logger.log('queue_message_failed', {
      queue: batch.queue,
      stage: job.jobType,
      result: outcome.retryable ? 'retry' : 'dead',
      duration_ms: Date.now() - startedAt,
      attempts,
      error: outcome.error,
    })
  }
}

/**
 * Publishes a job to its queue, when the binding exists.
 *
 * Returns false when it does not, which is the caller's signal to leave the
 * work for the D1 runner. That fallback is what makes the queue bindings
 * genuinely optional rather than a soft requirement.
 *
 * @param {Record<string, unknown>} env
 * @param {object} job a row from `lead_jobs`
 * @returns {Promise<boolean>} whether the job was published
 */
export async function publishJob(env, job) {
  const QUEUE_FOR_JOB_TYPE = {
    lead_research: env.LEAD_RESEARCH_QUEUE,
    ai_review: env.LEAD_AI_REVIEW_QUEUE,
    outreach_draft: env.LEAD_AI_REVIEW_QUEUE,
    reply_analysis: env.LEAD_MAILBOX_QUEUE,
    mailbox_sync: env.LEAD_MAILBOX_QUEUE,
  }

  const queue = QUEUE_FOR_JOB_TYPE[job.jobType]
  if (!queue) return false

  try {
    await queue.send({
      jobId: job.id,
      jobType: job.jobType,
      leadId: job.leadId,
      campaignId: job.campaignId,
      correlationId: job.correlationId,
    })
    return true
  } catch (error) {
    // A queue that refused the message must not lose the job. It stays pending
    // in D1 and the cron drain picks it up.
    createLogger({}).log('queue_publish_failed', {
      stage: job.jobType,
      result: 'error',
      error: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}
