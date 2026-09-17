import { nowIso, parseJsonField } from '../utils/responses'

/**
 * Attribution, consent, and activity for an inquiry.
 *
 * Kept in one module because all three are written in the same transaction as
 * the inquiry itself and are only ever read together (the admin detail panel),
 * but in three tables because they have genuinely different lifetimes: an
 * attribution row can be dropped for a privacy request without touching the
 * inquiry, a consent row is append-only evidence that must never be rewritten,
 * and activity is an unbounded operational timeline.
 */

function nullable(value) {
  const normalized = String(value ?? '').trim()
  return normalized === '' ? null : normalized
}

/**
 * Whitelisted attribution fields only. An unexpected key in the request body
 * is dropped here rather than silently widening what gets stored.
 */
export function buildAttributionStatement(db, leadId, attribution = {}) {
  return db
    .prepare(
      `INSERT INTO lead_attribution (
        id, lead_id, entry_page, source_page, landing_page, referrer,
        first_touch_source, first_touch_medium, first_touch_campaign, first_touch_at,
        latest_touch_source, latest_touch_medium, latest_touch_campaign,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        form_id, offer_id, solution_id, case_study_id, insight_id, anonymous_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      leadId,
      nullable(attribution.entryPage),
      nullable(attribution.sourcePage),
      nullable(attribution.landingPage),
      nullable(attribution.referrer),
      nullable(attribution.firstTouchSource),
      nullable(attribution.firstTouchMedium),
      nullable(attribution.firstTouchCampaign),
      nullable(attribution.firstTouchAt),
      nullable(attribution.latestTouchSource),
      nullable(attribution.latestTouchMedium),
      nullable(attribution.latestTouchCampaign),
      nullable(attribution.utmSource),
      nullable(attribution.utmMedium),
      nullable(attribution.utmCampaign),
      nullable(attribution.utmTerm),
      nullable(attribution.utmContent),
      nullable(attribution.formId),
      nullable(attribution.offerId),
      nullable(attribution.solutionId),
      nullable(attribution.caseStudyId),
      nullable(attribution.insightId),
      nullable(attribution.anonymousId),
      nowIso(),
    )
}

export function buildConsentStatement(db, leadId, consent = {}, source = '') {
  return db
    .prepare(
      `INSERT INTO lead_consents (
        id, lead_id, consent_type, granted, consent_text_version, privacy_policy_version, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      leadId,
      String(consent.consentType || 'contact'),
      consent.granted ? 1 : 0,
      String(consent.consentTextVersion || ''),
      String(consent.privacyPolicyVersion || ''),
      nullable(source),
      nowIso(),
    )
}

/**
 * `metadata` is stringified as-is, so callers must pass ONLY safe summary
 * values — never message bodies, emails, or names. Every call site in this
 * repository follows that rule; see docs/security.md.
 */
export function buildActivityStatement(db, leadId, { activityType, status = 'ok', actor = null, metadata = {} }) {
  return db
    .prepare(
      `INSERT INTO lead_activities (id, lead_id, activity_type, status, actor, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      leadId,
      String(activityType),
      String(status),
      nullable(actor),
      JSON.stringify(metadata || {}),
      nowIso(),
    )
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function recordLeadActivity(db, leadId, activity) {
  await buildActivityStatement(db, leadId, activity).run()
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getLeadAttribution(db, leadId) {
  const row = await db
    .prepare(
      `SELECT entry_page, source_page, landing_page, referrer,
              first_touch_source, first_touch_medium, first_touch_campaign, first_touch_at,
              latest_touch_source, latest_touch_medium, latest_touch_campaign,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              form_id, offer_id, solution_id, case_study_id, insight_id, anonymous_id, created_at
       FROM lead_attribution WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(leadId)
    .first()

  if (!row) return null
  return {
    entryPage: row.entry_page || '',
    sourcePage: row.source_page || '',
    landingPage: row.landing_page || '',
    referrer: row.referrer || '',
    firstTouchSource: row.first_touch_source || '',
    firstTouchMedium: row.first_touch_medium || '',
    firstTouchCampaign: row.first_touch_campaign || '',
    firstTouchAt: row.first_touch_at || '',
    latestTouchSource: row.latest_touch_source || '',
    latestTouchMedium: row.latest_touch_medium || '',
    latestTouchCampaign: row.latest_touch_campaign || '',
    utmSource: row.utm_source || '',
    utmMedium: row.utm_medium || '',
    utmCampaign: row.utm_campaign || '',
    utmTerm: row.utm_term || '',
    utmContent: row.utm_content || '',
    formId: row.form_id || '',
    offerId: row.offer_id || '',
    solutionId: row.solution_id || '',
    caseStudyId: row.case_study_id || '',
    insightId: row.insight_id || '',
    anonymousId: row.anonymous_id || '',
    createdAt: row.created_at,
  }
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listLeadConsents(db, leadId) {
  const result = await db
    .prepare(
      `SELECT id, consent_type, granted, consent_text_version, privacy_policy_version, source, created_at
       FROM lead_consents WHERE lead_id = ? ORDER BY created_at DESC`,
    )
    .bind(leadId)
    .all()

  return (result.results || []).map((row) => ({
    id: row.id,
    consentType: row.consent_type,
    granted: Boolean(row.granted),
    consentTextVersion: row.consent_text_version || '',
    privacyPolicyVersion: row.privacy_policy_version || '',
    source: row.source || '',
    createdAt: row.created_at,
  }))
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listLeadActivities(db, leadId) {
  const result = await db
    .prepare(
      `SELECT id, activity_type, status, actor, metadata_json, created_at
       FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC`,
    )
    .bind(leadId)
    .all()

  return (result.results || []).map((row) => ({
    id: row.id,
    activityType: row.activity_type,
    status: row.status,
    actor: row.actor || '',
    metadata: parseJsonField(row.metadata_json, {}),
    createdAt: row.created_at,
  }))
}
