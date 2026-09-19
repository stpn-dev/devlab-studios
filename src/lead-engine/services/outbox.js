/**
 * The outbox: approved drafts handed to an external sender, one at a time.
 *
 * WHAT THIS CHANGES, STATED PLAINLY. Until now nothing could transmit a
 * message to a prospect, and a person pressed Send. This endpoint lets an
 * external automation — n8n, in this deployment — collect approved drafts and
 * send them. Automated sending now exists in the operator's stack. It does NOT
 * exist in this codebase: there is still no SMTP client, no ESP and no mailbox
 * API here, and nothing in this repository can put a message on the wire. The
 * separation is deliberate and worth preserving, because it keeps every
 * compliance gate on this side of the boundary where it can be tested.
 *
 * TWO RULES THIS IS BUILT AROUND:
 *
 * 1. **Under-send rather than double-send.** A draft is marked exported the
 *    moment it is handed out and is never offered again. If the sender crashes
 *    between collecting and transmitting, that message is simply not sent — it
 *    sits at READY_TO_CONTACT for a person to deal with. The opposite bias
 *    would mail a stranger twice, which is unrecoverable and is exactly how a
 *    sending domain earns a spam reputation.
 *
 * 2. **The cap counts what was actually sent**, not what was handed out.
 *    `OUTBOUND_SEND_CONFIRMED` activity rows are the ground truth, because a
 *    draft collected and never transmitted did not consume anything real.
 *
 * Every gate in `exportDraft` runs for every message — suppression is
 * re-checked at the moment of collection, and an AI draft whose content guard
 * recorded violations is refused. That is the whole reason collection goes
 * through the same function the human-facing download uses rather than reading
 * the drafts table directly.
 */

import { assertFlag } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { OUTREACH } from '../config/defaults.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { recordActivity } from '../repositories/activity.js'
import { getCurrentDraft, getDraft } from '../repositories/drafts.js'
import { getLead, listLeadsInStage, refreshNextAction, transitionLead } from '../repositories/leads.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { exportDraft } from './draftExport.js'
import { createLogger } from './log.js'
import { operationError } from '../repositories/helpers.js'

/** Start of the current UTC day, which is the window the cap applies over. */
function startOfUtcDay(now) {
  const date = new Date(now)
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString()
}

/**
 * How many messages have actually been confirmed sent today.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Date} now
 */
async function sentToday(db, now) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM lead_activity WHERE event_type = ? AND created_at >= ?')
    .bind(ACTIVITY.OUTBOUND_SEND_CONFIRMED, startOfUtcDay(now))
    .first()

  return Number(row?.n ?? 0)
}

/**
 * Collects approved drafts for an external sender.
 *
 * @param {Env} env
 * @param {{ limit?: number, now?: Date, correlationId?: string }} [options]
 * @returns {Promise<{ remainingToday: number, sentToday: number, dailyLimit: number,
 *                     messages: Array<object> }>}
 */
export async function collectOutbox(env, options = {}) {
  env = await withOperationalFlags(env)
  assertFlag(env, 'engine')

  const db = env.DB
  const now = options.now instanceof Date ? options.now : new Date()
  const logger = createLogger({ correlationId: options.correlationId })

  const settings = await resolveSettingsSafely(db)
  const configured = Number(settings['outreach.sending']?.dailyLimit)
  const dailyLimit = Number.isFinite(configured) && configured >= 0 ? configured : OUTREACH.dailySendLimit

  const already = await sentToday(db, now)
  const remainingToday = Math.max(0, dailyLimit - already)

  // The cap is checked before any work, so a day that is already spent costs
  // one cheap COUNT rather than a walk through the pipeline.
  if (remainingToday === 0) {
    logger.log('outbox_collected', { result: 'capped', sent_today: already, daily_limit: dailyLimit })
    return { remainingToday: 0, sentToday: already, dailyLimit, messages: [] }
  }

  // Read from settings alongside the daily limit, not from the constant.
  // Hard-coding this meant raising `dailyLimit` to 100 still handed out only
  // 10 per call, so a once-a-day schedule silently stayed at 10 whatever the
  // operator configured - a cap that lies about its own value.
  const configuredPerCall = Number(settings['outreach.sending']?.maxPerCollection)
  const perCollection =
    Number.isFinite(configuredPerCall) && configuredPerCall > 0 ? configuredPerCall : OUTREACH.maxPerCollection

  const requested = Number.isFinite(Number(options.limit))
    ? Math.max(1, Math.trunc(Number(options.limit)))
    : perCollection
  const take = Math.min(requested, perCollection, remainingToday)

  // Over-fetched deliberately: leads at this stage may have no current draft,
  // or one already handed out, and both are skipped below.
  const candidates = await listLeadsInStage(db, STAGES.READY_TO_CONTACT, { limit: take * 4 })

  const messages = []
  for (const lead of candidates) {
    if (messages.length >= take) break

    const draft = await getCurrentDraft(db, lead.id, 'initial')
    if (!draft) continue
    // Already handed out. Never offered twice — see rule 1 in the module note.
    if (draft.exported) continue

    try {
      // Through exportDraft, so suppression is re-checked right now and an AI
      // draft that failed its content guard is refused. A refusal skips this
      // lead and does not stop the collection.
      const exported = await exportDraft(env, draft.id, {
        actorEmail: options.actorEmail ?? null,
        correlationId: logger.correlationId,
        now,
      })

      messages.push({
        draftId: draft.id,
        leadId: lead.id,
        to: exported.to,
        subject: exported.subject,
        bodyText: exported.bodyText,
        message: exported.message,
      })
    } catch (error) {
      logger.log('outbox_skipped', {
        lead_id: lead.id,
        draft_id: draft.id,
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  logger.log('outbox_collected', {
    result: 'ok',
    collected: messages.length,
    sent_today: already,
    daily_limit: dailyLimit,
  })

  return { remainingToday, sentToday: already, dailyLimit, messages }
}

/**
 * Records that an external sender transmitted a message.
 *
 * Idempotent: confirming twice records one activity row and leaves the lead
 * where it is. A retry after a timeout must not double-count against the cap.
 *
 * @param {Env} env
 * @param {string} draftId
 * @param {{ providerMessageId?: string|null, sentAt?: string|null, correlationId?: string }} [options]
 */
export async function confirmSent(env, draftId, options = {}) {
  env = await withOperationalFlags(env)
  assertFlag(env, 'engine')

  const db = env.DB
  const draft = await getDraft(db, draftId)
  if (!draft) throw operationError('Draft not found.', 404)

  const lead = await getLead(db, draft.leadId)
  if (!lead) throw operationError('Lead not found.', 404)

  const logger = createLogger({ correlationId: options.correlationId, leadId: lead.id })

  // Checked before writing, because recordActivity returns an id whether or
  // not the dedupe key collided — and "already confirmed" has to be
  // distinguishable so a retry does not read as a second send.
  const existing = await db
    .prepare('SELECT id FROM lead_activity WHERE dedupe_key = ?')
    .bind(`outbound_send:${draftId}`)
    .first()

  await recordActivity(db, {
    leadId: lead.id,
    campaignId: lead.campaignId,
    eventType: ACTIVITY.OUTBOUND_SEND_CONFIRMED,
    actor: 'system',
    summary: `An external sender transmitted the message to ${draft.subject ? 'the contact' : 'the contact'}.`,
    metadata: {
      draftId,
      providerMessageId: options.providerMessageId ?? null,
      sentAt: options.sentAt ?? null,
    },
    // One confirmation per draft, whatever the sender retries.
    dedupeKey: `outbound_send:${draftId}`,
    correlationId: logger.correlationId,
  })

  if (lead.stage !== STAGES.CONTACTED && lead.stage !== STAGES.AWAITING_REPLY) {
    await transitionLead(db, lead.id, STAGES.CONTACTED, {
      summary: 'Message sent by the configured external sender.',
      correlationId: logger.correlationId,
    })
  }

  await refreshNextAction(db, lead.id)
  logger.log('outbound_send_confirmed', { draft_id: draftId, duplicate: Boolean(existing) })

  return { status: existing ? 'already_confirmed' : 'ok', draftId, leadId: lead.id }
}
