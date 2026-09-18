/**
 * The single place work is handed out.
 *
 * `enqueueJob` (repositories/jobs.js) writes the durable row; this decides what
 * happens next. When a Queue binding exists the job is ALSO published to it for
 * immediate, concurrency-controlled processing; when one does not, the row sits
 * in `lead_jobs` until the cron drains it. Callers use this rather than
 * `enqueueJob` directly, so adding Queues never means editing call sites.
 *
 * WHY THE ROW IS WRITTEN FIRST, ALWAYS:
 *
 * D1 is the system of record and a queue is transient. Publishing first and
 * writing second would mean a message that is delivered, processed, and looking
 * for a job row that does not exist yet. Writing first means the worst case is a
 * job the queue never learned about — which the cron drain picks up. One of
 * those failure modes loses work; the other delays it.
 *
 * A PUBLISHED JOB IS STILL `pending`, deliberately. `claimJobs` therefore may
 * hand the same job to the cron drain while a queue consumer is working on it.
 * Both paths run the same handler and every handler is idempotent at the
 * database level — a second research run re-crawls and replaces its own signals,
 * a second AI review is refused by the daily budget or produces another audited
 * run, and message import is unique on `provider_message_id`. The duplicate
 * costs work, not correctness. Tightening this to a claim-on-publish is the
 * obvious next step if Queues are ever actually enabled; it is not worth the
 * complexity while the D1 runner is the only consumer.
 */

import { enqueueJob } from '../repositories/jobs.js'
import { publishJob } from '../queues/consumer.js'
import { createLogger } from '../services/log.js'

/**
 * Whether any Lead CRM queue binding is configured.
 *
 * Exported so the admin's job screen can say which substrate is actually in
 * use rather than leaving an operator to infer it from behaviour.
 *
 * @param {Env} env
 */
export function hasQueueBindings(env) {
  return Boolean(env?.LEAD_RESEARCH_QUEUE || env?.LEAD_AI_REVIEW_QUEUE || env?.LEAD_MAILBOX_QUEUE)
}

/**
 * Enqueues a job and dispatches it to a queue when one is bound.
 *
 * @param {Env} env
 * @param {Parameters<typeof enqueueJob>[1]} input
 * @returns {Promise<{ job: object|null, created: boolean, published: boolean }>}
 */
export async function dispatchJob(env, input) {
  const { job, created } = await enqueueJob(env.DB, input)

  // Not created means an identical job is already outstanding; publishing again
  // would hand the queue a second message for one unit of work.
  if (!created || !job) return { job, created, published: false }
  if (!hasQueueBindings(env)) return { job, created, published: false }

  const published = await publishJob(env, job)

  if (published) {
    createLogger({ correlationId: job.correlationId, leadId: job.leadId }).log('job_published', {
      stage: job.jobType,
      result: 'ok',
    })
  }

  // A refused publish is not an error: the row is pending and the cron drain
  // will find it. `publishJob` logs the reason.
  return { job, created, published }
}
