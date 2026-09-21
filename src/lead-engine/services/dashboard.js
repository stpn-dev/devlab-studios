/**
 * The CRM dashboard's data.
 *
 * Two distinct things, kept apart on purpose: the PIPELINE counts (how many
 * leads are at each stage) and the ACTIONABLE cards (what a human needs to do
 * today). The funnel is a health metric; the cards are a work queue, and
 * conflating them produces a screen that looks busy and tells you nothing.
 *
 * Nothing here counts email opens. There is no open tracking in this system: an
 * open is not actionable and recording one means embedding a resource in
 * somebody's inbox. Only clicks on a tracked link are recorded, and only when
 * LEAD_TRACKING_ENABLED is on. See docs/lead-engine/architecture.md.
 */

import { resolveFlags } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { resolveReadiness } from '../config/readiness.js'
import { ACTIVITY } from '../domain/activity.js'
import { PROGRESSION_STAGES, STAGES } from '../domain/pipeline.js'
import { countActivityByType } from '../repositories/activity.js'
import { getTodayAiSpend } from '../repositories/aiRuns.js'
import { countComplianceByState } from '../repositories/compliance.js'
import { countPendingReplyDrafts } from '../repositories/drafts.js'
import { countJobsByStatus, listJobs } from '../repositories/jobs.js'
import { countLeadsByStage, listLeadsInStage } from '../repositories/leads.js'
import { listFailedCrawlRuns } from '../repositories/research.js'
import { listUnansweredReplies } from '../repositories/conversations.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { listSources } from '../repositories/sources.js'
import { getUsage } from '../repositories/usage.js'

/** Consecutive sync failures after which the dashboard raises it as a problem. */
const SYNC_PROBLEM_THRESHOLD = 2

/**
 * @param {Env} env
 * @param {{ campaignId?: string|null }} [options]
 */
export async function getDashboard(env, options = {}) {
  env = await withOperationalFlags(env)
  const db = env.DB
  const campaignId = options.campaignId ?? null
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    stageCounts,
    activityCounts,
    aiSpend,
    usage,
    jobCounts,
    complianceCounts,
    pendingReplyDrafts,
    replies,
    failedCrawls,
    deadJobs,
    settings,
    sources,
  ] = await Promise.all([
    countLeadsByStage(db, campaignId),
    countActivityByType(db, since24h),
    getTodayAiSpend(db),
    getUsage(db),
    countJobsByStatus(db),
    countComplianceByState(db),
    countPendingReplyDrafts(db),
    listUnansweredReplies(db, { limit: 10 }),
    listFailedCrawlRuns(db, { since: since7d, limit: 10 }),
    listJobs(db, { status: 'dead', limit: 10 }),
    resolveSettingsSafely(db),
    listSources(db),
  ])

  const [readyForReview, readyToContact, needingAction] = await Promise.all([
    listLeadsInStage(db, STAGES.READY_FOR_REVIEW, { campaignId, limit: 10 }),
    listLeadsInStage(db, STAGES.READY_TO_CONTACT, { campaignId, limit: 10 }),
    listLeadsInStage(db, STAGES.NO_CONTACT, { campaignId, limit: 10 }),
  ])

  const stageOf = (stage) => stageCounts[stage] ?? 0

  const pipeline = PROGRESSION_STAGES.map((stage) => ({ stage, count: stageOf(stage) }))

  // Cumulative counts: "researched" means researched OR further along, which is
  // what a funnel is supposed to show. Counting only the leads sitting AT a
  // stage produces a funnel that goes up and down as work drains through it.
  const cumulative = {}
  let running = 0
  for (let index = PROGRESSION_STAGES.length - 1; index >= 0; index -= 1) {
    running += stageOf(PROGRESSION_STAGES[index])
    cumulative[PROGRESSION_STAGES[index]] = running
  }


  return {
    flags: resolveFlags(env),
    /**
     * Flags say what was asked for; this says whether the credentials behind it
     * exist. A flag on without its secret fails later, inside a job, against a
     * real lead — so it is reported here, before a run.
     */
    readiness: resolveReadiness(env, { businessIdentity: settings['business.identity'], sources }),
    pipeline,
    cumulative,
    totals: {
      discovered: stageOf(STAGES.DISCOVERED),
      researched: cumulative[STAGES.RESEARCHED] ?? 0,
      ruleQualified: cumulative[STAGES.RULE_QUALIFIED] ?? 0,
      aiQualified: cumulative[STAGES.AI_QUALIFIED] ?? 0,
      contactable: cumulative[STAGES.CONTACT_FOUND] ?? 0,
      readyForReview: stageOf(STAGES.READY_FOR_REVIEW),
      readyToContact: stageOf(STAGES.READY_TO_CONTACT),
      contacted: stageOf(STAGES.CONTACTED),
      awaitingReply: stageOf(STAGES.AWAITING_REPLY),
      replied: stageOf(STAGES.REPLIED),
      conversations: stageOf(STAGES.CONVERSATION),
      meetings: stageOf(STAGES.MEETING),
      proposals: stageOf(STAGES.PROPOSAL),
      won: stageOf(STAGES.WON),
      lost: stageOf(STAGES.LOST),
      notQualified: stageOf(STAGES.NOT_QUALIFIED),
      hold: stageOf(STAGES.HOLD),
      doNotContact: stageOf(STAGES.DO_NOT_CONTACT) + stageOf(STAGES.UNSUBSCRIBED),
    },
    /** The work queue. Each card is something a person does, not a number. */
    actionable: {
      qualifiedAwaitingReview: { count: stageOf(STAGES.READY_FOR_REVIEW), leads: readyForReview },
      readyToContact: { count: stageOf(STAGES.READY_TO_CONTACT), leads: readyToContact },
      newReplies: { count: replies.length, replies },
      replyDraftsReady: { count: pendingReplyDrafts },
      leadsNeedingManualAction: { count: stageOf(STAGES.NO_CONTACT), leads: needingAction },
      failedResearchJobs: { count: failedCrawls.length + (jobCounts.dead ?? 0), crawls: failedCrawls, jobs: deadJobs },
      suppressionEvents: {
        count:
          (activityCounts[ACTIVITY.SUPPRESSED] ?? 0) +
          (activityCounts[ACTIVITY.UNSUBSCRIBED] ?? 0) +
          (activityCounts[ACTIVITY.DO_NOT_CONTACT] ?? 0) +
          (activityCounts[ACTIVITY.COMPLAINT] ?? 0),
      },
    },
    usage: { daily: usage, ai: aiSpend },
    jobs: jobCounts,
    compliance: complianceCounts,
    activity24h: activityCounts,
  }
}
