/**
 * The durable job runner.
 *
 * Claims a bounded batch from `lead_jobs`, runs each, and records the outcome.
 * This is what executes when Cloudflare Queues are not bound — and when they
 * are, the queue consumer calls the very same `runJob`, so the two substrates
 * cannot drift.
 *
 * Bounded by design. A Worker invocation has a CPU budget, and a runner that
 * drained an unbounded backlog would be killed partway through with jobs still
 * marked running. Claiming `JOBS.batchSize` at a time means the worst case is
 * a batch that takes longer than expected, whose leases then expire and whose
 * jobs the next tick reclaims.
 */

import { JOBS } from '../config/defaults.js'
import { resolveFlags } from '../config/flags.js'
import { ACTIVITY } from '../domain/activity.js'
import { claimJobs, completeJob, failJob } from '../repositories/jobs.js'
import { recordActivity } from '../repositories/activity.js'
import { createLogger } from '../services/log.js'
import { runJob } from './handlers.js'

/**
 * Drains one batch.
 *
 * @param {Record<string, unknown>} env
 * @param {{ jobTypes?: string[], limit?: number, fetchImpl?: typeof fetch,
 *           correlationId?: string }} [options]
 * @returns {Promise<{ claimed: number, succeeded: number, failed: number, deadLettered: number }>}
 */
export async function drainJobs(env, options = {}) {
  const flags = resolveFlags(env)
  if (!flags.engine) return { claimed: 0, succeeded: 0, failed: 0, deadLettered: 0, reason: 'engine_disabled' }

  const db = env.DB
  const logger = createLogger({ correlationId: options.correlationId })

  const jobs = await claimJobs(db, {
    jobTypes: options.jobTypes ?? null,
    limit: options.limit ?? JOBS.batchSize,
  })

  const summary = { claimed: jobs.length, succeeded: 0, failed: 0, deadLettered: 0 }

  for (const job of jobs) {
    const jobLogger = logger.child({ campaignId: job.campaignId, leadId: job.leadId })
    const startedAt = Date.now()

    const outcome = await runJob(env, job, { fetchImpl: options.fetchImpl })

    if (outcome.ok) {
      await completeJob(db, job.id)
      summary.succeeded += 1
      jobLogger.log('job_completed', {
        stage: job.jobType,
        result: 'ok',
        duration_ms: Date.now() - startedAt,
        attempts: job.attempts,
      })
      continue
    }

    const disposition = await failJob(db, job.id, { error: outcome.error, retryable: outcome.retryable })

    if (disposition.status === 'dead') {
      summary.deadLettered += 1
      // A dead-lettered job becomes visible work for a human, so it gets a
      // timeline entry — a job that quietly gave up is indistinguishable from
      // one that never ran.
      await recordActivity(db, {
        leadId: job.leadId,
        campaignId: job.campaignId,
        eventType: ACTIVITY.JOB_DEAD_LETTERED,
        summary: `${job.jobType.replace(/_/g, ' ')} gave up after ${job.attempts} attempts: ${outcome.error}`,
        metadata: { jobId: job.id, jobType: job.jobType, error: outcome.error },
        dedupeKey: `job_dead:${job.id}`,
        correlationId: jobLogger.correlationId,
      })
    } else {
      summary.failed += 1
    }

    jobLogger.log('job_failed', {
      stage: job.jobType,
      result: disposition.status,
      duration_ms: Date.now() - startedAt,
      attempts: job.attempts,
      retryable: outcome.retryable,
      error: outcome.error,
    })
  }

  if (summary.claimed > 0) {
    logger.log('job_batch_completed', { result: 'ok', ...summary })
  }

  return summary
}

/**
 * Runs one job immediately, bypassing the queue.
 *
 * The admin's "run now" button. Still goes through `runJob`, so a manual run
 * and a background run execute identical code — the difference is only who
 * decided to start it.
 *
 * @param {Record<string, unknown>} env
 * @param {{ jobType: string, leadId?: string, campaignId?: string, payload?: object }} job
 */
export async function runJobNow(env, job, options = {}) {
  const logger = createLogger({ correlationId: options.correlationId, leadId: job.leadId, campaignId: job.campaignId })

  const outcome = await runJob(
    env,
    { ...job, payload: job.payload ?? {}, correlationId: logger.correlationId, attempts: 1 },
    { fetchImpl: options.fetchImpl },
  )

  logger.log('job_run_now', { stage: job.jobType, result: outcome.ok ? 'ok' : 'error', error: outcome.error })
  return outcome
}
