/**
 * The research pipeline for one lead: crawl, extract, score, route.
 *
 * Everything in here is resumable. Each stage writes its result to D1 before
 * the next begins, so a Worker that dies mid-pipeline leaves a lead with a
 * completed crawl and no signals — which the next run picks up and continues,
 * rather than a lead in an unknown state.
 *
 * Budget is consumed BEFORE the work, through the atomic reservation in
 * repositories/usage.js. A crawl that is then skipped (robots.txt, an
 * unreachable site) releases the pages it did not use.
 */

import { assertFlag, resolveFlags } from '../config/flags.js'
import { CRAWLER } from '../config/defaults.js'
import { ACTIVITY } from '../domain/activity.js'
import { STAGES } from '../domain/pipeline.js'
import { crawlSite } from '../crawler/crawlSite.js'
import { isBrowserRunConfigured, renderPage, shouldUseBrowserRun } from '../crawler/browserRun.js'
import { extractSignals } from '../signals/extract.js'
import { priorityForRouting, routesToAi, scoreLead, stageForRouting } from '../scoring/score.js'
import { selectContacts } from '../contacts/discover.js'
import { validateContact } from '../contacts/validate.js'
import { recordActivity } from '../repositories/activity.js'
import { getCampaign } from '../repositories/campaigns.js'
import { getCompany } from '../repositories/companies.js'
import { upsertContact } from '../repositories/contacts.js'
import { getLead, refreshNextAction, transitionLead, updateLeadSummary } from '../repositories/leads.js'
import { finishCrawlRun, getDetectedSignalKeys, replaceSignals, startCrawlRun } from '../repositories/research.js'
import { recordScore } from '../repositories/scores.js'
import { resolveSettingsSafely } from '../repositories/settings.js'
import { consumeBudget, releaseBudget } from '../repositories/usage.js'
import { createLogger } from './log.js'

/**
 * Researches one lead end to end.
 *
 * Returns an outcome rather than throwing for an ordinary failure: a site that
 * blocks us, a budget that ran out, or a page that will not load are all
 * expected results that must be recorded, not exceptions that abort a batch of
 * fifty leads.
 *
 * @param {Env} env
 * @param {string} leadId
 * @param {{ fetchImpl?: typeof fetch, correlationId?: string, actorEmail?: string|null }} [options]
 * @returns {Promise<{ status: string, reason?: string, score?: object, routing?: string }>}
 */
export async function researchLead(env, leadId, options = {}) {
  assertFlag(env, 'crawler')

  const db = env.DB
  const lead = await getLead(db, leadId)
  if (!lead) return { status: 'not_found' }

  const logger = createLogger({
    correlationId: options.correlationId,
    campaignId: lead.campaignId,
    leadId,
  })

  const [company, campaign, settings] = await Promise.all([
    getCompany(db, lead.companyId),
    getCampaign(db, lead.campaignId),
    resolveSettingsSafely(db),
  ])

  if (!company) return { status: 'not_found' }

  const limits = { ...CRAWLER, ...(settings['crawler.limits'] || {}) }
  const crawlerIdentity = settings['crawler.identity'] || {}

  await transitionLead(db, leadId, STAGES.RESEARCHING, {
    eventType: ACTIVITY.CRAWL_STARTED,
    summary: `Researching ${company.canonicalDomain}`,
    correlationId: logger.correlationId,
  })

  const runId = await startCrawlRun(db, { leadId, companyId: company.id })
  logger.log('crawl_started', { stage: 'crawl', domain: company.canonicalDomain })

  // Each page attempt reserves a unit of the daily page budget atomically. The
  // crawler calls this before every request, so a run cannot overshoot.
  let pagesReserved = 0
  const onBudget = async () => {
    const budget = await consumeBudget(db, 'crawl_pages', {
      campaignId: lead.campaignId,
      limits: settings['usage.daily'],
    })
    if (budget.allowed) pagesReserved += 1
    return budget.allowed
  }

  let crawl
  try {
    crawl = await crawlSite(company.websiteUrl, {
      fetchImpl: options.fetchImpl,
      limits,
      userAgent: crawlerIdentity.userAgent || limits.userAgent,
      onBudget,
    })
  } catch (error) {
    // crawlSite is written not to throw, so reaching here means a genuine
    // defect rather than a site problem. Recorded as a failed run so the lead
    // is retryable and the failure is visible.
    const message = error instanceof Error ? error.message : 'unknown'
    await finishCrawlRun(db, runId, { status: 'failed', errorMessage: message })
    await releaseBudget(db, 'crawl_pages', { amount: pagesReserved, campaignId: lead.campaignId })
    await transitionLead(db, leadId, STAGES.HOLD, {
      eventType: ACTIVITY.CRAWL_FAILED,
      summary: `Research failed: ${message}`,
      correlationId: logger.correlationId,
    })
    logger.log('crawl_crashed', { stage: 'crawl', result: 'error', error: message })
    return { status: 'failed', reason: message }
  }

  // Pages reserved but never fetched go back: a robots.txt refusal should not
  // consume the day's budget.
  const unusedPages = Math.max(0, pagesReserved - crawl.pagesAttempted)
  if (unusedPages > 0) {
    await releaseBudget(db, 'crawl_pages', { amount: unusedPages, campaignId: lead.campaignId })
  }

  // How many independent sources reported this business. Counted from the
  // stored source records rather than carried through the pipeline, so a
  // company corroborated by a LATER discovery run earns the signal on its next
  // research pass too.
  const corroboration = await db
    .prepare('SELECT COUNT(DISTINCT source_id) AS total FROM lead_source_records WHERE company_id = ?')
    .bind(company.id)
    .first()
  const sourceRecordCount = Number(corroboration?.total || 0)

  let pages = crawl.pages

  // Browser Run, only when all three conditions hold. Checked here rather than
  // inside the crawler so the budget and the feature flag live with the other
  // budget decisions.
  const browserVerdict = shouldUseBrowserRun(crawl)
  if (browserVerdict.eligible && resolveFlags(env).browserRun && isBrowserRunConfigured(env)) {
    const budget = await consumeBudget(db, 'browser_runs', { limits: settings['usage.daily'] })
    if (budget.allowed) {
      const rendered = await renderPage(env, company.websiteUrl, { fetchImpl: options.fetchImpl })
      if (rendered.ok) {
        pages = [{ url: company.websiteUrl, finalUrl: company.websiteUrl, html: rendered.html, used: true }]
        crawl.method = 'browser'
        await recordActivity(db, {
          leadId,
          campaignId: lead.campaignId,
          eventType: ACTIVITY.BROWSER_RUN_USED,
          summary: 'Rendered the homepage with a browser because the HTTP fetch returned an empty shell.',
          correlationId: logger.correlationId,
        })
        logger.log('browser_run', { stage: 'crawl', result: 'ok' })
      } else {
        await releaseBudget(db, 'browser_runs')
        logger.log('browser_run', { stage: 'crawl', result: 'error', error: rendered.reason })
      }
    }
  }

  await finishCrawlRun(db, runId, {
    status: crawl.status,
    method: crawl.method,
    pagesAttempted: crawl.pagesAttempted,
    pagesFetched: crawl.pagesFetched,
    bytesFetched: crawl.bytesFetched,
    robotsAllowed: crawl.robotsAllowed,
    skipReason: crawl.skipReason,
    errorMessage: crawl.errorMessage,
    // Page bodies are stripped before the run is stored: the crawl record is a
    // log of what was fetched, never a cache of what was in it.
    pages: crawl.pages.map(({ html, ...page }) => {
      void html
      return page
    }),
  })

  if (crawl.status !== 'completed') {
    const terminal = crawl.status === 'skipped' ? STAGES.NOT_QUALIFIED : STAGES.HOLD
    await transitionLead(db, leadId, terminal, {
      eventType: crawl.status === 'skipped' ? ACTIVITY.CRAWL_SKIPPED : ACTIVITY.CRAWL_FAILED,
      summary: crawl.skipReason || crawl.errorMessage || 'Research did not complete.',
      metadata: { skipReason: crawl.skipReason, error: crawl.errorMessage },
      correlationId: logger.correlationId,
    })
    logger.log('crawl_finished', { stage: 'crawl', result: crawl.status, reason: crawl.skipReason || crawl.errorMessage })
    return { status: crawl.status, reason: crawl.skipReason || crawl.errorMessage }
  }

  // --- Signals -------------------------------------------------------------
  // The campaign's country travels with its config so the extractor can compare
  // it to the company's without a second lookup.
  const extraction = extractSignals({
    pages,
    websiteUrl: company.websiteUrl,
    campaignConfig: { ...(campaign?.config || {}), countryCode: campaign?.countryCode },
    company: {
      countryCode: company.countryCode,
      city: company.city,
      metro: company.metro,
      region: company.region,
      sourceCount: sourceRecordCount,
    },
  })

  await replaceSignals(db, leadId, extraction.signals, runId)
  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    eventType: ACTIVITY.SIGNALS_EXTRACTED,
    summary: `Extracted ${extraction.signals.length} signals from ${crawl.pagesFetched} pages.`,
    metadata: { signalCount: extraction.signals.length, technologies: extraction.technologies },
    // Idempotent per crawl run: a duplicate delivery re-extracting the same run
    // must not produce a second timeline entry.
    dedupeKey: `signals:${runId}`,
    correlationId: logger.correlationId,
  })

  await transitionLead(db, leadId, STAGES.RESEARCHED, {
    eventType: ACTIVITY.CRAWL_COMPLETED,
    summary: `Analyzed ${crawl.pagesFetched} pages.`,
    correlationId: logger.correlationId,
  })

  // --- Contacts ------------------------------------------------------------
  // Stored before scoring, because contactability is one of the four scoring
  // categories and a contact found during this crawl should count toward it.
  const selected = selectContacts({ extractedEmails: extraction.emails, websiteUrl: company.websiteUrl })

  for (const contact of selected) {
    const validation = await validateContact(contact.email, {
      companyDomain: company.canonicalDomain,
      fetchImpl: options.fetchImpl,
    })
    if (!validation.syntaxValid) continue

    await upsertContact(db, {
      leadId,
      companyId: company.id,
      email: contact.email,
      emailType: contact.emailType,
      sourceUrl: contact.sourceUrl,
      sourceType: contact.sourceType,
      publishedPublicly: contact.publishedPublicly,
      isBusinessContact: true,
      syntaxValid: validation.syntaxValid,
      domainMatchesCompany: validation.domainMatchesCompany,
      mxPresent: validation.mxPresent,
      isPrimary: contact.isPrimary,
    })
  }

  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    eventType: selected.length > 0 ? ACTIVITY.CONTACT_FOUND : ACTIVITY.CONTACT_MISSING,
    summary: selected.length > 0
      ? `Found ${selected.length} public business contact${selected.length === 1 ? '' : 's'}.`
      : 'No public business contact found on the analyzed pages.',
    metadata: { count: selected.length },
    dedupeKey: `contacts:${runId}`,
    correlationId: logger.correlationId,
  })

  // --- Score ---------------------------------------------------------------
  const detectedKeys = await getDetectedSignalKeys(db, leadId)
  const score = scoreLead({
    detectedSignalKeys: detectedKeys,
    weights: settings['scoring.weights'],
    thresholds: settings['scoring.thresholds'],
  })

  await recordScore(db, leadId, score)
  await updateLeadSummary(db, leadId, { ruleScore: score.total, priority: priorityForRouting(score.routing) })

  await recordActivity(db, {
    leadId,
    campaignId: lead.campaignId,
    eventType: ACTIVITY.RULE_SCORED,
    summary: `Scored ${score.total} (${score.routing.replace(/_/g, ' ')}).`,
    metadata: { total: score.total, routing: score.routing, reasons: score.reasons },
    correlationId: logger.correlationId,
  })

  const nextStage = stageForRouting(score.routing, STAGES)
  await transitionLead(db, leadId, nextStage, {
    eventType: routesToAi(score.routing) ? ACTIVITY.RULE_QUALIFIED : ACTIVITY.RULE_REJECTED,
    summary: routesToAi(score.routing)
      ? `Qualified with a score of ${score.total}.`
      : `Did not qualify (score ${score.total}).`,
    correlationId: logger.correlationId,
  })

  await refreshNextAction(db, leadId)

  logger.log('research_completed', {
    stage: 'research',
    result: 'ok',
    score: score.total,
    routing: score.routing,
    pages: crawl.pagesFetched,
    signals: extraction.signals.length,
    contacts: selected.length,
  })

  return { status: 'completed', score, routing: score.routing, routesToAi: routesToAi(score.routing) }
}
