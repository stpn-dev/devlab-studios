/**
 * Campaign discovery: run the adapters, dedupe, admit leads.
 *
 * Deduplication happens BEFORE anything expensive. A candidate that resolves to
 * a company we already have becomes a `DUPLICATE_SKIPPED` activity row and
 * nothing else — no crawl, no AI call, no second lead. That ordering is what
 * keeps a hundred-candidate run from costing a hundred crawls when forty of
 * them are businesses a previous run already found.
 *
 * Every adapter is optional and every adapter's failure is contained: Brave
 * being unconfigured, Overpass timing out, and a malformed CSV are all recorded
 * outcomes that leave the rest of the run intact.
 */

import { assertFlag } from '../config/flags.js'
import { withOperationalFlags } from '../config/operationalFlags.js'
import { ACTIVITY } from '../domain/activity.js'
import { discoverViaBrave } from '../discovery/brave.js'
import { discoverViaOverpass } from '../discovery/overpass.js'
import { dedupeCandidates, normalizeCandidate } from '../discovery/normalize.js'
import { recordActivity } from '../repositories/activity.js'
import { getCampaign, recordCampaignRun } from '../repositories/campaigns.js'
import { findCompanyByDomain, upsertCompany } from '../repositories/companies.js'
import { upsertLead } from '../repositories/leads.js'
import { assertSourceUsable, recordSourceRun, upsertSourceRecord } from '../repositories/sources.js'
import { checkMonthlyDiscoveryBudget, consumeBudget, releaseBudget } from '../repositories/usage.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { dispatchJob } from '../jobs/dispatch.js'
import { operationError } from '../repositories/helpers.js'
import { createLogger } from './log.js'

/** Adapter slug → the registry slug it must be approved under. */
const ADAPTERS = Object.freeze({
  'osm-overpass': { run: discoverViaOverpass, usageMetric: 'overpass_requests' },
  'brave-search': { run: discoverViaBrave, usageMetric: 'brave_requests' },
})

/**
 * Admits one normalized candidate into the pipeline.
 *
 * Idempotent at both levels: the company upsert is keyed on canonical domain
 * and the lead upsert on (campaign, company), so re-running discovery updates
 * rather than duplicating.
 *
 * @returns {Promise<{ outcome: 'created'|'duplicate'|'rejected', leadId?: string, reason?: string }>}
 */
async function admitCandidate(db, { campaign, candidate, sourceId, correlationId }) {
  const existingCompany = await findCompanyByDomain(db, candidate.canonicalDomain)

  const { company, created: companyCreated } = await upsertCompany(db, {
    name: candidate.name,
    websiteUrl: candidate.websiteUrl,
    industry: candidate.category || campaign.config?.industryLabel || null,
    countryCode: candidate.countryCode || campaign.countryCode,
    region: candidate.region,
    // The normalizer does not distinguish a metro from a city, so the city is
    // used for both; a campaign's metro list is matched against it.
    metro: candidate.city,
    city: candidate.city,
    postalCode: candidate.postalCode ?? null,
    streetAddress: candidate.street,
    phone: candidate.phone,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  })

  if (sourceId) {
    await upsertSourceRecord(db, {
      sourceId,
      campaignId: campaign.id,
      externalId: candidate.externalId,
      companyId: company.id,
      rawName: candidate.name,
      rawWebsite: candidate.websiteUrl,
      rawPhone: candidate.phone,
      rawEmail: candidate.email,
      rawAddress: candidate.street,
      rawCity: candidate.city,
      rawRegion: candidate.region,
      rawCountryCode: candidate.countryCode,
      rawCategory: candidate.category,
      payload: candidate.payload,
    })
  }

  const { lead, created } = await upsertLead(db, { campaignId: campaign.id, companyId: company.id })

  if (!created) {
    await recordActivity(db, {
      leadId: lead.id,
      campaignId: campaign.id,
      eventType: ACTIVITY.DUPLICATE_SKIPPED,
      summary: `${candidate.canonicalDomain} is already in this campaign.`,
      // Idempotent per (lead, domain): re-running discovery must not fill the
      // timeline with a duplicate notice every time.
      dedupeKey: `duplicate:${lead.id}:${candidate.canonicalDomain}`,
      correlationId,
    })
    return { outcome: 'duplicate', leadId: lead.id }
  }

  await recordActivity(db, {
    leadId: lead.id,
    campaignId: campaign.id,
    eventType: ACTIVITY.DISCOVERED,
    summary: `Discovered ${company.name} (${company.canonicalDomain}).`,
    metadata: {
      source: candidate.sourceSlug || null,
      newCompany: companyCreated,
      // A company that already existed from another campaign is worth knowing
      // about: it means the same business is being approached twice.
      seenInAnotherCampaign: Boolean(existingCompany),
    },
    correlationId,
  })

  return { outcome: 'created', leadId: lead.id }
}

/**
 * Runs discovery for one campaign.
 *
 * @param {Env} env
 * @param {string} campaignId
 * @param {{ fetchImpl?: typeof fetch, limit?: number, correlationId?: string,
 *           actorEmail?: string|null, enqueueResearch?: boolean, allowInactive?: boolean }} [options]
 */
export async function runCampaignDiscovery(env, campaignId, options = {}) {
  env = await withOperationalFlags(env)
  assertFlag(env, 'discovery')

  const db = env.DB
  const campaign = await getCampaign(db, campaignId)
  if (!campaign) throw operationError('Campaign not found.', 404)

  const logger = createLogger({ correlationId: options.correlationId, campaignId })

  // A normal or scheduled run requires ACTIVE. The admin's explicit dry-run
  // path may inspect a draft or paused campaign, but never revives a completed
  // or archived one.
  const dryRunnable = options.allowInactive && ['draft', 'paused'].includes(campaign.status)
  if (campaign.status !== 'active' && !dryRunnable) {
    return { status: 'skipped', reason: `Campaign is ${campaign.status}.`, created: 0, duplicates: 0 }
  }

  const monthly = await checkMonthlyDiscoveryBudget(db)
  if (!monthly.allowed) {
    await recordActivity(db, {
      campaignId,
      eventType: ACTIVITY.USAGE_LIMIT_REACHED,
      summary: `Monthly discovery limit of ${monthly.limit} candidates reached.`,
      metadata: { metric: 'discovery_candidates', scope: 'monthly' },
      correlationId: logger.correlationId,
    })
    return { status: 'limited', reason: 'monthly_discovery_budget_exhausted', created: 0, duplicates: 0 }
  }

  const settings = await resolveSettingsSafely(db)
  const limit = Math.min(options.limit ?? campaign.maxCandidates, campaign.maxCandidates)

  const results = { created: 0, duplicates: 0, rejected: 0, adapters: [] }
  const allCandidates = []

  for (const [slug, adapter] of Object.entries(ADAPTERS)) {
    // The registry gate. A source that is not registered, not enabled, or not
    // policy-approved is skipped with its reason recorded — never used.
    const permission = await assertSourceUsable(db, slug)
    if (!permission.allowed) {
      results.adapters.push({ slug, status: 'skipped', reason: permission.reason })
      logger.log('discovery_source_skipped', { provider: slug, result: 'skipped', reason: permission.reason })
      continue
    }

    const requestBudget = await consumeBudget(db, adapter.usageMetric, { limits: settings['usage.daily'] })
    if (!requestBudget.allowed) {
      results.adapters.push({ slug, status: 'limited', reason: 'daily_request_budget_exhausted' })
      continue
    }

    let outcome
    try {
      outcome = await adapter.run({
        campaign,
        fetchImpl: options.fetchImpl,
        limit: Math.max(0, limit - allCandidates.length),
        apiKey: slug === 'brave-search' ? env.BRAVE_SEARCH_API_KEY : undefined,
      })
    } catch (error) {
      // An adapter is not supposed to throw, so this is a defect rather than an
      // upstream problem — contained so one bad adapter cannot end the run.
      outcome = { candidates: [], requests: 0, error: error instanceof Error ? error.message : 'adapter_crashed' }
    }

    await recordSourceRun(db, permission.source.id, {
      status: outcome.error ? 'failed' : 'ok',
      error: outcome.error,
    })

    results.adapters.push({
      slug,
      status: outcome.error ? 'error' : 'ok',
      reason: outcome.error,
      candidates: outcome.candidates.length,
      requests: outcome.requests,
    })

    for (const candidate of outcome.candidates) {
      allCandidates.push({ ...candidate, sourceSlug: slug, sourceId: permission.source.id })
    }

    logger.log('discovery_source_completed', {
      provider: slug,
      result: outcome.error ? 'error' : 'ok',
      candidates: outcome.candidates.length,
      requests: outcome.requests,
    })

    if (allCandidates.length >= limit) break
  }

  // Deduped across adapters before anything expensive happens. A business that
  // both Overpass and Brave returned is one candidate.
  const deduped = dedupeCandidates(allCandidates).slice(0, limit)

  for (const candidate of deduped) {
    const budget = await consumeBudget(db, 'discovery_candidates', {
      campaignId,
      limits: settings['usage.daily'],
    })
    if (!budget.allowed) {
      await recordActivity(db, {
        campaignId,
        eventType: ACTIVITY.USAGE_LIMIT_REACHED,
        summary: `Daily discovery limit of ${budget.limit} candidates reached.`,
        metadata: { metric: 'discovery_candidates' },
        correlationId: logger.correlationId,
      })
      break
    }

    const admitted = await admitCandidate(db, {
      campaign,
      candidate,
      sourceId: candidate.sourceId,
      correlationId: logger.correlationId,
    })

    if (admitted.outcome === 'created') {
      results.created += 1
      // Research is enqueued rather than run inline: a discovery run finding a
      // hundred businesses must not become a hundred sequential crawls inside
      // one Worker invocation.
      if (options.enqueueResearch !== false) {
        await dispatchJob(env, {
          jobType: 'lead_research',
          campaignId,
          leadId: admitted.leadId,
          payload: { leadId: admitted.leadId },
          dedupeKey: `research:${admitted.leadId}`,
          correlationId: logger.correlationId,
        })
      }
    } else if (admitted.outcome === 'duplicate') {
      results.duplicates += 1
      // A duplicate consumed no crawl, no AI call and no new lead, so the
      // budget unit reserved for it goes back. `consumeBudget` clamps its
      // amount to a positive integer, so returning one needs releaseBudget.
      await releaseBudget(db, 'discovery_candidates', { campaignId })
    } else {
      results.rejected += 1
    }
  }

  await recordCampaignRun(db, campaignId, { status: 'ok' })

  logger.log('discovery_completed', {
    result: 'ok',
    candidates: deduped.length,
    created: results.created,
    duplicates: results.duplicates,
  })

  return { status: 'ok', ...results, candidates: deduped.length }
}

/**
 * Admits manually imported candidates.
 *
 * Runs through exactly the same normalization, deduplication and admission path
 * as an automated adapter — an imported domain is not a privileged one.
 *
 * @param {Env} env
 * @param {string} campaignId
 * @param {Array<object>} rawCandidates from parseImportCsv / parseDomainList
 * @param {{ actorEmail?: string|null, correlationId?: string }} [options]
 */
export async function importCandidates(env, campaignId, rawCandidates, options = {}) {
  const db = env.DB
  const campaign = await getCampaign(db, campaignId)
  if (!campaign) throw operationError('Campaign not found.', 404)

  const logger = createLogger({ correlationId: options.correlationId, campaignId })
  const permission = await assertSourceUsable(db, 'manual-import')
  if (!permission.allowed) throw operationError(permission.reason || 'Manual import is not approved.', 409)

  const normalized = []
  const rejected = []
  for (const raw of rawCandidates) {
    // Already-normalized candidates pass through; raw rows are normalized here,
    // so both the CSV parser and a direct API caller hit the same validation.
    const result = raw.canonicalDomain ? { ok: true, candidate: raw } : normalizeCandidate(raw)
    if (result.ok) normalized.push(result.candidate)
    else rejected.push({ raw, reason: result.reason })
  }

  const deduped = dedupeCandidates(normalized)
  const results = { created: 0, duplicates: 0, rejected: rejected.length, rejections: rejected.slice(0, 50) }

  for (const candidate of deduped) {
    const admitted = await admitCandidate(db, {
      campaign,
      candidate,
      sourceId: permission.source.id,
      correlationId: logger.correlationId,
    })

    if (admitted.outcome === 'created') {
      results.created += 1
      await dispatchJob(env, {
        jobType: 'lead_research',
        campaignId,
        leadId: admitted.leadId,
        payload: { leadId: admitted.leadId },
        dedupeKey: `research:${admitted.leadId}`,
        correlationId: logger.correlationId,
      })
    } else if (admitted.outcome === 'duplicate') {
      results.duplicates += 1
    }
  }

  logger.log('manual_import_completed', {
    result: 'ok',
    created: results.created,
    duplicates: results.duplicates,
    rejected: results.rejected,
  })

  return { status: 'ok', ...results }
}
