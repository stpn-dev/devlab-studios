/**
 * Cloudflare Workflows for the Lead Intelligence Engine.
 *
 * These are THIN. Every class below is a sequence of `step.do()` calls around
 * the same handler functions the D1 job runner and the queue consumer use
 * (src/lead-engine/jobs/handlers.js). None of the business logic lives here,
 * deliberately:
 *
 *   - It stays testable in plain Node, without a Workflows runtime.
 *   - It stays runnable from the admin's "run now" button and from cron.
 *   - The engine keeps working with no Workflows binding configured at all,
 *     which is the state this branch ships in.
 *
 * What Workflows add on top is durable execution: a `step.do()` that completed
 * is not re-run when a later step fails, and the instance survives a Worker
 * eviction. Where that matters most is `CampaignDiscoveryWorkflow` and
 * `LeadResearchWorkflow`, which make paid external calls that must not be
 * repeated on a retry.
 *
 * D1 REMAINS AUTHORITATIVE. Workflow state is execution bookkeeping; the lead
 * record, its signals, its score and its messages are all in D1 before a step
 * returns. A lost workflow instance costs a re-run, never a lost lead.
 *
 * NOT YET BOUND. `wrangler.jsonc` has the `workflows` block commented out with
 * the activation steps, because a binding naming a Workflow that has not been
 * created fails `wrangler deploy` for the entire Worker — including the public
 * site. See docs/lead-engine/cloudflare-workflows.md.
 */

import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { runJob } from '../jobs/handlers.js'
import { drainJobs } from '../jobs/runner.js'
import { syncMailbox } from '../services/mailboxSync.js'
import { processInboundReply } from '../services/replyCopilot.js'
import { listLeadsInStage } from '../repositories/leads.js'
import { STAGES } from '../domain/pipeline.js'

/**
 * What a step returns to the Workflows runtime.
 *
 * `runJob` types its `result` as `unknown`, which is accurate — each handler
 * returns something different — but `step.do()` requires a statically
 * serializable return type. Narrowing here rather than widening the handler
 * keeps the useful typing on the handler side and confines the assertion to
 * this file, which is the only place the constraint applies.
 */
function toStepOutcome(outcome: Awaited<ReturnType<typeof runJob>>) {
  const result = (outcome.result ?? {}) as { status?: string; routesToAi?: boolean }
  return {
    ok: outcome.ok,
    error: outcome.error ?? '',
    retryable: outcome.retryable ?? false,
    // Only the two fields a later step branches on. Workflow state is execution
    // bookkeeping, not a second copy of the lead — everything else the handler
    // produced is already in D1 before this returns.
    status: result.status ?? '',
    routesToAi: result.routesToAi === true,
  }
}

interface CampaignDiscoveryParams {
  campaignId: string
  limit?: number
  correlationId?: string
}

interface LeadResearchParams {
  leadId: string
  campaignId?: string
  correlationId?: string
}

interface ReplyAnalysisParams {
  messageId: string
  leadId?: string
  correlationId?: string
}

/**
 * Retry policy shared by every step that makes an external call.
 *
 * Three attempts with exponential backoff. Beyond that the problem is not
 * transient and a human should see it on the failed-jobs screen rather than
 * the Worker spending another hour proving it.
 */
const EXTERNAL_RETRY = {
  retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' },
  timeout: '5 minutes',
} as const

/**
 * Discovers candidates for one campaign, then hands each new lead to the job
 * ledger.
 *
 * Research is NOT run inline here. A campaign finding a hundred businesses
 * would otherwise become a hundred sequential crawls inside one workflow
 * instance, which both exceeds sensible step durations and makes the whole run
 * fail together. Enqueueing keeps each crawl independently retryable.
 */
export class CampaignDiscoveryWorkflow extends WorkflowEntrypoint<Env, CampaignDiscoveryParams> {
  async run(event: WorkflowEvent<CampaignDiscoveryParams>, step: WorkflowStep) {
    const { campaignId, limit, correlationId } = event.payload

    const discovery = await step.do('discover-candidates', EXTERNAL_RETRY, async () =>
      toStepOutcome(
        await runJob(this.env, {
          jobType: 'campaign_discovery',
          campaignId,
          leadId: null,
          payload: { campaignId, limit },
          correlationId,
          attempts: 1,
        }),
      ),
    )

    // A bounded drain in the same instance, so a small campaign completes
    // end-to-end without waiting for the next cron tick.
    const drained = await step.do('drain-research-batch', async () =>
      drainJobs(this.env, {
        jobTypes: ['lead_research'],
        limit: 10,
        correlationId,
      }),
    )

    return { discovery, drained }
  }
}

/**
 * Researches one lead: crawl, extract, score, then AI review and draft when it
 * qualifies.
 *
 * Each stage is its own step, so a Workers AI failure does not re-crawl the
 * site — the crawl step already completed and its result is in D1.
 */
export class LeadResearchWorkflow extends WorkflowEntrypoint<Env, LeadResearchParams> {
  async run(event: WorkflowEvent<LeadResearchParams>, step: WorkflowStep) {
    const { leadId, campaignId, correlationId } = event.payload

    const research = await step.do('research-lead', EXTERNAL_RETRY, async () =>
      toStepOutcome(
        await runJob(this.env, { jobType: 'lead_research', leadId, campaignId, payload: { leadId }, correlationId, attempts: 1 }),
      ),
    )

    if (!research.ok || !research.routesToAi) return { research, reviewed: false }

    const review = await step.do('ai-review', EXTERNAL_RETRY, async () =>
      toStepOutcome(
        await runJob(this.env, { jobType: 'ai_review', leadId, campaignId, payload: { leadId }, correlationId, attempts: 1 }),
      ),
    )

    if (!review.ok || review.status !== 'qualified') return { research, review, drafted: false }

    const draft = await step.do('outreach-draft', EXTERNAL_RETRY, async () =>
      toStepOutcome(
        await runJob(this.env, { jobType: 'outreach_draft', leadId, campaignId, payload: { leadId }, correlationId, attempts: 1 }),
      ),
    )

    return { research, review, draft }
  }
}

/**
 * Synchronizes the Zoho mailbox and analyses whatever replies arrived.
 *
 * Sent before Inbox, which `syncMailbox` already enforces — a manual send and
 * its reply can both land between runs, and the correct sequence needs the
 * send processed first.
 */
export class MailboxSyncWorkflow extends WorkflowEntrypoint<Env, { correlationId?: string }> {
  async run(event: WorkflowEvent<{ correlationId?: string }>, step: WorkflowStep) {
    const correlationId = event.payload?.correlationId

    const sync = await step.do('sync-mailbox', EXTERNAL_RETRY, async () => {
      const result = await syncMailbox(this.env, { correlationId })
      return { sent: result.sent.status, inbox: result.inbox.status, imported: result.sent.imported + result.inbox.imported }
    })

    // Queried rather than carried from the sync result, so a sync that
    // half-completed still gets its replies analysed.
    const replied: Array<{ id: string }> = await step.do('find-unanalyzed-replies', async () => {
      const leads: Array<{ id: string }> = await listLeadsInStage(this.env.DB, STAGES.REPLIED, { limit: 20 })
      return leads.map((lead) => ({ id: lead.id }))
    })

    const analyses: string[] = []
    for (const lead of replied) {
      const row = await this.env.DB.prepare(
        `SELECT id FROM lead_messages
         WHERE lead_id = ? AND direction = 'inbound' AND ai_summary IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(lead.id)
        .first<{ id: string }>()

      if (!row) continue

      // One step per message: a model failure on one reply must not discard
      // the analysis of the others.
      await step.do(`analyze-reply-${row.id}`, EXTERNAL_RETRY, async () => {
        await processInboundReply(this.env, row.id, { correlationId })
        // The analysis itself is persisted to D1 by the service; only the count
        // travels back through the workflow, so nothing here has to be
        // serializable beyond a string.
        return { messageId: row.id }
      })
      analyses.push(row.id)
    }

    return { sync, analyzed: analyses.length }
  }
}

/** Analyses one inbound reply and drafts a suggested response. */
export class ReplyAnalysisWorkflow extends WorkflowEntrypoint<Env, ReplyAnalysisParams> {
  async run(event: WorkflowEvent<ReplyAnalysisParams>, step: WorkflowStep) {
    const { messageId, correlationId } = event.payload

    return step.do('process-reply', EXTERNAL_RETRY, async () => {
      const result = await processInboundReply(this.env, messageId, { correlationId })
      return { analysis: result.analysis.status, drafted: Boolean(result.draft) }
    })
  }
}

/**
 * Housekeeping: reclaim stranded jobs, prune completed ones, drain the backlog.
 */
export class MaintenanceWorkflow extends WorkflowEntrypoint<Env, { correlationId?: string }> {
  async run(event: WorkflowEvent<{ correlationId?: string }>, step: WorkflowStep) {
    const correlationId = event.payload?.correlationId

    const maintenance = await step.do('maintenance', async () =>
      toStepOutcome(await runJob(this.env, { jobType: 'maintenance', payload: {}, correlationId, attempts: 1 })),
    )

    const drained = await step.do('drain-backlog', async () => drainJobs(this.env, { limit: 25, correlationId }))

    return { maintenance, drained }
  }
}
