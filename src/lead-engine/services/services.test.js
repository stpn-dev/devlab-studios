import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'

import { researchLead } from './research.js'
import { reviewLeadOpportunity } from './aiReview.js'
import { checkOutreachReadiness, generateOutreachDraft } from './outreach.js'
import { pushDraftToZoho } from './zohoDraft.js'
import { getDashboard } from './dashboard.js'
import { createCampaign } from '../repositories/campaigns.js'
import { upsertCompany } from '../repositories/companies.js'
import { getLead, upsertLead } from '../repositories/leads.js'
import { listContacts } from '../repositories/contacts.js'
import { getCurrentScore } from '../repositories/scores.js'
import { listSignals } from '../repositories/research.js'
import { addSuppression } from '../repositories/suppression.js'
import { getCurrentDraft } from '../repositories/drafts.js'
import { setSetting } from '../repositories/settings.js'
import { listActivity } from '../repositories/activity.js'
import { STAGES } from '../domain/pipeline.js'

/**
 * Service-level integration tests: real SQLite, stubbed network and model.
 *
 * These exercise the seams between modules — the places a unit test cannot
 * reach because the bug lives in how two correct pieces are wired together.
 * That is not hypothetical here: writing these found a crash in
 * `checkSuppression` that every unit test had passed straight over.
 */

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(resolve(here, '../../../migrations/0012_lead_intelligence_engine.sql'), 'utf8')

const FLAGS = {
  LEAD_ENGINE_ENABLED: 'true',
  LEAD_DISCOVERY_ENABLED: 'true',
  LEAD_CRAWLER_ENABLED: 'true',
  LEAD_AI_ENABLED: 'true',
}

/** A small property-management site with the signals the scorer looks for. */
const SITE = {
  'https://acme.com/robots.txt': new Response('User-agent: *\nDisallow:\n', { status: 200 }),
  'https://acme.com/': new Response(
    `<html><head><title>Acme Property Management</title></head><body>
       <p>Acme is a property management company serving Austin. We handle tenant screening,
          rent collection and maintenance coordination for owners and tenants.</p>
       <a href="/contact">Contact</a>
     </body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  ),
  'https://acme.com/contact': new Response(
    `<html><body>
       <p>To get started, please call our office during business hours, or
          download the form and return it to us.</p>
       <a href="mailto:hello@acme.com">hello@acme.com</a>
       <form action="/send"><textarea name="message"></textarea></form>
     </body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  ),
}

/** Serves SITE, answers DNS-over-HTTPS with an MX record, 404s anything else. */
function siteFetch(overrides = {}) {
  const pages = { ...SITE, ...overrides }
  return vi.fn(async (url) => {
    const key = String(url)

    if (key.includes('cloudflare-dns.com')) {
      return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: '10 mx.acme.com.' }] }), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      })
    }

    const match = Object.keys(pages).find((candidate) => key === candidate || key === `${candidate}/`)
    if (match) return pages[match].clone()

    return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } })
  })
}

const QUALIFIED_REVIEW = {
  qualified: true,
  confidence: 0.82,
  opportunity_type: 'manual_intake_automation',
  observed_problem: 'The public website asks visitors to call the office to begin.',
  recommended_solution: 'An online intake form that routes submissions automatically.',
  devlab_service: 'workflow_automation',
  outreach_angle: 'Open on the call-the-office intake step.',
  reasoning_summary: 'Manual intake language with no scheduling detected.',
  inference_notes: '',
}

const GOOD_DRAFT = {
  subject: 'Your service request intake',
  body:
    'I noticed your contact page asks visitors to call the office to get started. ' +
    'That often means each request is handled one at a time. Would an online intake form be useful?\n\nStephen',
  referenced_observations: ['contact page asks visitors to call the office'],
}

/** A Workers AI stub that answers each task with a supplied payload. */
function aiStub(byTask) {
  return {
    run: vi.fn(async (_model, body) => {
      const prompt = body.messages[0].content
      const task = prompt.includes('assess whether a business')
        ? 'opportunity_review'
        : prompt.includes('draft a short, first-contact')
          ? 'outreach_draft'
          : 'other'

      const answer = byTask[task]
      if (answer === undefined) return { response: 'no answer configured' }
      return { response: JSON.stringify(answer), usage: { neurons: 1 } }
    }),
  }
}

let db

async function seedLead() {
  const campaign = await createCampaign(db, {
    name: 'US Property Management',
    slug: 'us-pm',
    countryCode: 'US',
    description: 'Test campaign',
    config: {
      industryLabel: 'Property management',
      targetIndustries: ['property management'],
      serviceTerms: ['tenant screening', 'rent collection', 'maintenance coordination'],
      disqualifyingKeywords: ['we buy houses'],
    },
  })
  const { company } = await upsertCompany(db, {
    name: 'Acme Property Management',
    websiteUrl: 'https://acme.com',
    countryCode: 'US',
    city: 'Austin',
  })
  const { lead } = await upsertLead(db, { campaignId: campaign.id, companyId: company.id })
  return { campaign, company, lead }
}

beforeEach(async () => {
  db = createTestD1([migration])

  // The crawler's per-domain pause is a real courtesy to the sites it visits,
  // and it is configuration rather than a constant precisely so a test can turn
  // it off. Without this the suite spends 20 seconds sleeping.
  await setSetting(db, 'crawler.limits', { perDomainDelayMs: 0 })
})

describe('researchLead', () => {
  it('crawls, extracts, scores and routes a lead in one pass', async () => {
    const { lead } = await seedLead()
    const env = { ...FLAGS, DB: db }

    const result = await researchLead(env, lead.id, { fetchImpl: siteFetch() })

    expect(result.status).toBe('completed')

    const signals = await listSignals(db, lead.id)
    const keys = new Set(signals.map((signal) => signal.signalKey))
    expect(keys).toContain('ACTIVE_WEBSITE')
    expect(keys).toContain('TARGET_INDUSTRY')
    expect(keys).toContain('MANUAL_PHONE_INTAKE')
    expect(keys).toContain('PUBLIC_BUSINESS_EMAIL')
    expect(keys).toContain('NO_VISIBLE_SCHEDULING')

    const score = await getCurrentScore(db, lead.id)
    expect(score.total).toBeGreaterThan(0)
    // The reasons must account for exactly the score shown.
    expect(score.reasons.reduce((sum, reason) => sum + reason.points, 0)).toBe(score.total)
  })

  it('stores the contact it found, with the page that published it', async () => {
    const { lead } = await seedLead()
    await researchLead({ ...FLAGS, DB: db }, lead.id, { fetchImpl: siteFetch() })

    const contacts = await listContacts(db, lead.id)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].email).toBe('hello@acme.com')
    expect(contacts[0].sourceUrl).toBe('https://acme.com/contact')
    expect(contacts[0].sourceType).toBe('company_contact_page')
    expect(contacts[0].mxPresent).toBe(true)
  })

  it('never retains page bodies on the crawl record', async () => {
    const { lead } = await seedLead()
    await researchLead({ ...FLAGS, DB: db }, lead.id, { fetchImpl: siteFetch() })

    const row = await db.prepare('SELECT pages_json FROM lead_crawl_runs WHERE lead_id = ?').bind(lead.id).first()
    expect(row.pages_json).not.toContain('<html')
    expect(row.pages_json).not.toContain('property management company')
  })

  it('records a robots.txt refusal as a skip with its reason, and does not qualify', async () => {
    const { lead } = await seedLead()

    const result = await researchLead({ ...FLAGS, DB: db }, lead.id, {
      fetchImpl: siteFetch({
        'https://acme.com/robots.txt': new Response('User-agent: *\nDisallow: /\n', { status: 200 }),
      }),
    })

    expect(result.status).toBe('skipped')
    expect(result.reason).toContain('robots_disallowed')
    expect((await getLead(db, lead.id)).stage).toBe(STAGES.NOT_QUALIFIED)
  })

  it('respects the crawl page budget', async () => {
    const { lead } = await seedLead()
    await setSetting(db, 'usage.daily', { crawl_pages: 1 })

    await researchLead({ ...FLAGS, DB: db }, lead.id, { fetchImpl: siteFetch() })

    const run = await db.prepare('SELECT pages_fetched FROM lead_crawl_runs WHERE lead_id = ?').bind(lead.id).first()
    expect(Number(run.pages_fetched)).toBeLessThanOrEqual(1)
  })

  it('refuses to run at all when the crawler flag is off', async () => {
    const { lead } = await seedLead()
    await expect(researchLead({ DB: db }, lead.id, { fetchImpl: siteFetch() })).rejects.toThrow(/LEAD_ENGINE_ENABLED/)
  })
})

describe('reviewLeadOpportunity', () => {
  async function researched() {
    const seeded = await seedLead()
    await researchLead({ ...FLAGS, DB: db }, seeded.lead.id, { fetchImpl: siteFetch() })
    return seeded
  }

  it('qualifies a lead and records the run with its prompt version', async () => {
    const { lead } = await researched()
    const env = { ...FLAGS, DB: db, AI: aiStub({ opportunity_review: QUALIFIED_REVIEW }) }

    const result = await reviewLeadOpportunity(env, lead.id)

    expect(result.status).toBe('qualified')
    expect((await getLead(db, lead.id)).stage).toBe(STAGES.CONTACT_FOUND)

    const run = await db.prepare("SELECT * FROM lead_ai_runs WHERE task = 'opportunity_review'").first()
    expect(run.prompt_version).toBe('opportunity_review.v1')
    expect(run.status).toBe('ok')
  })

  it('never sends page HTML to the model', async () => {
    const { lead } = await researched()
    const ai = aiStub({ opportunity_review: QUALIFIED_REVIEW })

    await reviewLeadOpportunity({ ...FLAGS, DB: db, AI: ai }, lead.id)

    const [, body] = ai.run.mock.calls[0]
    const payload = body.messages[1].content
    expect(payload).not.toContain('<html')
    expect(payload).not.toContain('<form')
    expect(payload).not.toContain('mailto:')
  })

  it('holds the lead rather than rejecting it when the model answers unusably', async () => {
    const { lead } = await researched()
    const ai = { run: vi.fn(async () => ({ response: 'I cannot help with that.' })) }

    const result = await reviewLeadOpportunity({ ...FLAGS, DB: db, AI: ai }, lead.id)

    expect(result.status).toBe('invalid_output')
    // The rules already said this lead was worth looking at; a model failure
    // must not silently reject it.
    expect((await getLead(db, lead.id)).stage).toBe(STAGES.HOLD)

    const run = await db.prepare("SELECT * FROM lead_ai_runs WHERE task = 'opportunity_review'").first()
    expect(run.status).toBe('invalid_output')
    expect(run.raw_output).toContain('cannot help')
  })

  it('rejects a lead the model qualified below the confidence threshold', async () => {
    const { lead } = await researched()
    const env = {
      ...FLAGS,
      DB: db,
      AI: aiStub({ opportunity_review: { ...QUALIFIED_REVIEW, confidence: 0.2 } }),
    }

    expect((await reviewLeadOpportunity(env, lead.id)).status).toBe('rejected')
    expect((await getLead(db, lead.id)).stage).toBe(STAGES.NOT_QUALIFIED)
  })

  it('defers rather than failing when the daily AI budget is spent', async () => {
    const { lead } = await researched()
    await setSetting(db, 'usage.daily', { ai_reviews: 0 })

    const ai = aiStub({ opportunity_review: QUALIFIED_REVIEW })
    const result = await reviewLeadOpportunity({ ...FLAGS, DB: db, AI: ai }, lead.id)

    expect(result.status).toBe('deferred')
    expect(ai.run).not.toHaveBeenCalled()
  })
})

describe('the outreach gate', () => {
  async function qualified() {
    const seeded = await seedLead()
    const env = { ...FLAGS, DB: db, AI: aiStub({ opportunity_review: QUALIFIED_REVIEW }) }
    await researchLead(env, seeded.lead.id, { fetchImpl: siteFetch() })
    await reviewLeadOpportunity(env, seeded.lead.id)
    return { ...seeded, env }
  }

  /** The US profile blocks until a business postal address is configured. */
  async function configureBusinessIdentity() {
    await setSetting(db, 'business.identity', {
      legalName: 'DevLab Studios',
      senderName: 'Stephen',
      senderEmail: 'stephen@devlabstudios.com',
      postalAddress: '1 Example Street',
      city: 'Manila',
      region: 'NCR',
      postalCode: '1000',
      countryCode: 'PH',
      website: 'https://www.devlabstudios.com',
    })
  }

  it('blocks a US lead until the compliance business address is configured', async () => {
    const { lead } = await qualified()

    const readiness = await checkOutreachReadiness({ ...FLAGS, DB: db }, lead.id, { persist: false })

    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.some((blocker) => blocker.code.startsWith('compliance:'))).toBe(true)
  })

  it('blocks a suppressed contact even when everything else passes', async () => {
    const { lead } = await qualified()
    await configureBusinessIdentity()
    await addSuppression(db, { scope: 'email', value: 'hello@acme.com', reason: 'unsubscribe' })

    const readiness = await checkOutreachReadiness({ ...FLAGS, DB: db }, lead.id, { persist: false })

    expect(readiness.ready).toBe(false)
    expect(readiness.blockers.some((blocker) => blocker.code === 'suppressed')).toBe(true)
  })

  it('does not write a compliance evaluation when asked not to', async () => {
    const { lead } = await qualified()

    await checkOutreachReadiness({ ...FLAGS, DB: db }, lead.id, { persist: false })
    const none = await db.prepare('SELECT COUNT(*) AS total FROM lead_compliance_reviews').first()
    expect(Number(none.total)).toBe(0)

    await checkOutreachReadiness({ ...FLAGS, DB: db }, lead.id)
    const one = await db.prepare('SELECT COUNT(*) AS total FROM lead_compliance_reviews').first()
    expect(Number(one.total)).toBe(1)
  })

  it('refuses to generate a draft for a blocked lead, and calls no model', async () => {
    const { lead } = await qualified()
    await addSuppression(db, { scope: 'domain', value: 'acme.com', reason: 'do_not_contact' })

    const ai = aiStub({ outreach_draft: GOOD_DRAFT })
    const result = await generateOutreachDraft({ ...FLAGS, DB: db, AI: ai }, lead.id)

    expect(result.status).toBe('blocked')
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('generates a draft once every condition holds, and appends an opt-out line', async () => {
    const { lead } = await qualified()
    await configureBusinessIdentity()

    const env = { ...FLAGS, DB: db, AI: aiStub({ outreach_draft: GOOD_DRAFT }) }
    const result = await generateOutreachDraft(env, lead.id)

    expect(result.status).toBe('ok')
    expect(result.violations).toEqual([])

    const draft = await getCurrentDraft(db, lead.id)
    expect(draft.bodyText).toContain('call the office')
    // The opt-out instruction is added by the engine, not left to the model.
    expect(draft.bodyText.toLowerCase()).toMatch(/stop|unsubscribe|reply/)

    expect((await getLead(db, lead.id)).stage).toBe(STAGES.READY_FOR_REVIEW)
  })

  it('mints no tracked link when tracking is off, and rejects any link the model invents', async () => {
    const { lead } = await qualified()
    await configureBusinessIdentity()

    const env = {
      ...FLAGS,
      DB: db,
      AI: aiStub({
        outreach_draft: {
          ...GOOD_DRAFT,
          body: `${GOOD_DRAFT.body}

See https://www.devlabstudios.com/case-studies`,
        },
      }),
    }

    const result = await generateOutreachDraft(env, lead.id)

    expect(await db.prepare('SELECT COUNT(*) AS total FROM lead_tracking_tokens').first()).toMatchObject({ total: 0 })
    // An empty allow-list means every URL is disallowed — the safer default.
    expect(result.violations.map((violation) => violation.code)).toContain('DISALLOWED_LINK')
  })

  it('mints a tracked link when tracking is on, and permits that one link', async () => {
    const { lead } = await qualified()
    await configureBusinessIdentity()

    const ai = aiStub({ outreach_draft: GOOD_DRAFT })
    const env = { ...FLAGS, LEAD_TRACKING_ENABLED: 'true', DB: db, AI: ai }

    await generateOutreachDraft(env, lead.id)

    const token = await db.prepare('SELECT * FROM lead_tracking_tokens WHERE lead_id = ?').bind(lead.id).first()
    expect(token).toBeTruthy()
    expect(token.destination_url).toBe('https://www.devlabstudios.com')
    // Opaque and non-sequential — it must reveal nothing about the lead.
    expect(token.token).not.toContain(lead.id)
    expect(token.token.length).toBeGreaterThan(30)

    // The model was told which link it may use.
    const [, body] = ai.run.mock.calls[0]
    expect(body.messages[1].content).toContain(`/r/${token.token}`)
  })

  it('stores a draft that trips the invention guard, with the violations attached', async () => {
    const { lead } = await qualified()
    await configureBusinessIdentity()

    const env = {
      ...FLAGS,
      DB: db,
      AI: aiStub({
        outreach_draft: {
          subject: 'Save 40% on intake',
          body: 'We charge $2,000 and worked with a similar firm in Dallas.\n\nStephen',
          referenced_observations: [],
        },
      }),
    }

    const result = await generateOutreachDraft(env, lead.id)

    expect(result.status).toBe('ok')
    // NOT silently rewritten — the reviewer sees exactly what the model claimed.
    const codes = result.violations.map((violation) => violation.code)
    expect(codes).toContain('PRICE_CLAIM')
    expect(codes).toContain('METRIC_CLAIM')
    expect(codes).toContain('CLIENT_CLAIM')
  })
})

describe('pushDraftToZoho', () => {
  async function readyToPush() {
    const seeded = await seedLead()
    const env = { ...FLAGS, DB: db, AI: aiStub({ opportunity_review: QUALIFIED_REVIEW, outreach_draft: GOOD_DRAFT }) }

    await researchLead(env, seeded.lead.id, { fetchImpl: siteFetch() })
    await reviewLeadOpportunity(env, seeded.lead.id)
    await setSetting(db, 'business.identity', {
      legalName: 'DevLab Studios', senderName: 'Stephen', senderEmail: 'stephen@devlabstudios.com',
      postalAddress: '1 Example Street', city: 'Manila', region: 'NCR', postalCode: '1000',
      countryCode: 'PH', website: 'https://www.devlabstudios.com',
    })
    await generateOutreachDraft(env, seeded.lead.id)

    return { ...seeded, draft: await getCurrentDraft(db, seeded.lead.id) }
  }

  const ZOHO_ENV = {
    ZOHO_MAIL_ENABLED: 'true',
    ZOHO_ACCOUNT_ID: 'acct-1',
    ZOHO_USER_EMAIL: 'stephen@devlabstudios.com',
    ZOHO_OAUTH_CLIENT_ID: 'client-1',
    ZOHO_OAUTH_CLIENT_SECRET: 'secret-1',
    ZOHO_OAUTH_REFRESH_TOKEN: '1000.refresh',
  }

  function zohoFetch(captured) {
    return vi.fn(async (url, init) => {
      if (String(url).includes('/oauth/v2/token')) {
        return new Response(JSON.stringify({ access_token: '1000.a', expires_in: 3600 }), { status: 200 })
      }
      captured.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ data: { draftId: 'z-1', messageId: 'm-1' } }), { status: 200 })
    })
  }

  it('saves a draft and does NOT mark the lead contacted', async () => {
    const { lead, draft } = await readyToPush()
    const captured = []

    const result = await pushDraftToZoho({ ...FLAGS, ...ZOHO_ENV, DB: db }, draft.id, {
      fetchImpl: zohoFetch(captured),
      actorEmail: 'stephen@devlabstudios.com',
    })

    expect(result.status).toBe('ok')
    expect(captured[0].mode).toBe('draft')

    // The whole point: a draft in a mailbox is not a contacted prospect.
    expect((await getLead(db, lead.id)).stage).toBe(STAGES.READY_TO_CONTACT)
    expect((await getLead(db, lead.id)).stage).not.toBe(STAGES.CONTACTED)
  })

  it('re-checks suppression at the moment of the push, not just at render time', async () => {
    const { draft } = await readyToPush()
    // Added AFTER the screen would have rendered as ready.
    await addSuppression(db, { scope: 'email', value: 'hello@acme.com', reason: 'unsubscribe' })

    const fetchImpl = vi.fn()
    await expect(
      pushDraftToZoho({ ...FLAGS, ...ZOHO_ENV, DB: db }, draft.id, { fetchImpl }),
    ).rejects.toThrow(/suppressed/i)

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('leaves the draft retryable and the lead untouched when Zoho fails', async () => {
    const { lead, draft } = await readyToPush()

    await expect(
      pushDraftToZoho({ ...FLAGS, ...ZOHO_ENV, DB: db }, draft.id, {
        fetchImpl: vi.fn(async (url) =>
          String(url).includes('/oauth/v2/token')
            ? new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }), { status: 200 })
            : new Response(JSON.stringify({ message: 'upstream down' }), { status: 503 }),
        ),
      }),
    ).rejects.toThrow()

    const stored = await db.prepare('SELECT status FROM lead_outreach_drafts WHERE id = ?').bind(draft.id).first()
    expect(stored.status).toBe('zoho_draft_failed')
    // Not contacted, and the generated text is not lost.
    expect((await getLead(db, lead.id)).stage).toBe(STAGES.READY_FOR_REVIEW)
  })

  it('is idempotent — a second push does not create a second mailbox draft', async () => {
    const { draft } = await readyToPush()
    const captured = []
    const env = { ...FLAGS, ...ZOHO_ENV, DB: db }

    await pushDraftToZoho(env, draft.id, { fetchImpl: zohoFetch(captured) })
    const again = await pushDraftToZoho(env, draft.id, { fetchImpl: zohoFetch(captured) })

    expect(again.status).toBe('already_created')
    expect(captured).toHaveLength(1)
  })

  it('records the Zoho draft in the activity timeline', async () => {
    const { lead, draft } = await readyToPush()
    await pushDraftToZoho({ ...FLAGS, ...ZOHO_ENV, DB: db }, draft.id, { fetchImpl: zohoFetch([]) })

    const activity = await listActivity(db, { leadId: lead.id })
    const entry = activity.find((event) => event.eventType === 'ZOHO_DRAFT_CREATED')
    expect(entry.summary).toMatch(/Open Zoho to review and send it/i)
  })
})

describe('the dashboard', () => {
  it('reports an inert engine without failing on an empty database', async () => {
    const dashboard = await getDashboard({ DB: db })

    expect(dashboard.flags.engine).toBe(false)
    expect(dashboard.totals.discovered).toBe(0)
    expect(dashboard.actionable.newReplies.count).toBe(0)
    expect(dashboard.zoho.configured).toBe(false)
  })

  it('reports readiness against a real settings row, not just the flags', async () => {
    // The dashboard resolves settings from D1, so this is the one place the
    // readiness panel is exercised against the same store the operator edits.
    const dashboard = await getDashboard({ DB: db })
    const identity = dashboard.readiness.capabilities.find((entry) => entry.key === 'outreach_identity')

    expect(dashboard.readiness.ready).toBe(false)
    expect(dashboard.readiness.blocking).toContain('outreach_identity')
    // Seeded defaults leave the postal address empty on purpose — this system
    // does not invent one.
    expect(identity.missing).toContain('business.identity.postalAddress')
  })

  it('clears the identity block once the setting is filled in', async () => {
    await setSetting(db, 'business.identity', {
      legalName: 'DevLab Studios',
      senderName: 'Test Sender',
      senderEmail: 'hello@example.com',
      postalAddress: '1 Example Street',
      city: 'Testville',
      region: 'CA',
      postalCode: '90000',
      countryCode: 'US',
      website: 'https://example.com',
    })

    const dashboard = await getDashboard({ DB: db })

    expect(dashboard.readiness.blocking).not.toContain('outreach_identity')
  })

  it('counts the funnel cumulatively, so work draining through does not shrink it', async () => {
    const { lead } = await seedLead()
    await researchLead({ ...FLAGS, DB: db }, lead.id, { fetchImpl: siteFetch() })

    const dashboard = await getDashboard({ ...FLAGS, DB: db })
    // The lead has moved past DISCOVERED, but "researched" still counts it.
    expect(dashboard.totals.researched).toBeGreaterThanOrEqual(1)
  })
})
