import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import { recordBounce, recordTransmissionFailure } from './outbox.js'
import { ACTIVITY } from '../domain/activity.js'

/**
 * A transmission failure is NOT a bounce, and this suite exists because the two
 * were once the same call.
 *
 * The n8n outreach workflow routed ANY error from its send node to
 * `recordBounce` with `kind: 'hard'` — which suppresses the address forever and
 * moves the lead to NO_CONTACT. But the errors that node actually produces are
 * almost all OURS:
 *
 *   - `nodemailer` not importable (NODE_FUNCTION_ALLOW_EXTERNAL unset)
 *   - Postfix down or refusing the connection
 *   - the CMS unreachable, or the bearer token wrong
 *   - a network fault or an n8n runtime error
 *
 * None of those say anything about the recipient. Under that wiring, a missing
 * npm module would have quietly destroyed prospects — and the more broken the
 * infrastructure, the more of them, each with an audit trail indistinguishable
 * from a real bounce.
 *
 * So the two paths are tested side by side: the same draft, one route that must
 * never suppress and one that must.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MIGRATIONS = join(HERE, '..', '..', '..', 'migrations')
const schema = [
  readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0013_lead_usage_metric_nominatim.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8'),
  readFileSync(join(MIGRATIONS, '0015_mailbox_drafts.sql'), 'utf8'),
]

const NOW = '2026-09-20T12:00:00.000Z'
const DRAFT_ID = 'draft-tx-0001'
const RECIPIENT = 'someone@prospect.example'

let env

beforeEach(async () => {
  env = { DB: createTestD1(schema), LEAD_ENGINE_ENABLED: 'true' }

  for (const sql of [
    `INSERT INTO lead_campaigns (id, name, slug, country_code, created_at, updated_at)
       VALUES ('c', 'T', 't', 'US', '${NOW}', '${NOW}')`,
    `INSERT INTO lead_companies (id, canonical_domain, name, website_url, first_discovered_at, created_at, updated_at)
       VALUES ('co', 'prospect.example', 'P', 'https://prospect.example', '${NOW}', '${NOW}', '${NOW}')`,
    `INSERT INTO lead_leads (id, campaign_id, company_id, stage, created_at, updated_at)
       VALUES ('l', 'c', 'co', 'CONTACTED', '${NOW}', '${NOW}')`,
    `INSERT INTO lead_contacts (id, lead_id, company_id, email, source_url, source_type, is_primary, discovered_at, created_at, updated_at)
       VALUES ('ct', 'l', 'co', '${RECIPIENT}', 'https://prospect.example/c', 'company_contact_page', 1, '${NOW}', '${NOW}', '${NOW}')`,
    `INSERT INTO lead_outreach_drafts (id, lead_id, contact_id, kind, status, subject, body_text, created_at, updated_at)
       VALUES ('${DRAFT_ID}', 'l', 'ct', 'initial', 'edited', 'S', 'B', '${NOW}', '${NOW}')`,
    `INSERT INTO lead_settings (key, value_json, updated_at)
       VALUES ('operations.flags', '{"engine":true}', '${NOW}')`,
  ]) {
    await env.DB.prepare(sql).run()
  }
})

async function db_markExported() {
  const { recordDraftExported } = await import('../repositories/drafts.js')
  await recordDraftExported(env.DB, DRAFT_ID)
}

async function suppression() {
  const result = await env.DB.prepare('SELECT * FROM lead_suppression').all()
  return result.results ?? []
}

async function stage() {
  const row = await env.DB.prepare("SELECT stage FROM lead_leads WHERE id = 'l'").first()
  return row.stage
}

async function activity(eventType) {
  const result = await env.DB.prepare('SELECT * FROM lead_activity WHERE event_type = ?').bind(eventType).all()
  return result.results ?? []
}

describe('a local transmission failure', () => {
  it('suppresses nothing and does not touch the lead', async () => {
    const result = await recordTransmissionFailure(env, DRAFT_ID, {
      error: "Cannot find module 'nodemailer'",
      retryable: false,
    })

    expect(result.suppressed).toBe(false)
    expect(await suppression()).toHaveLength(0)
    // The lead stays exactly where it was. NO_CONTACT here would have removed a
    // perfectly good prospect because of a missing npm module.
    expect(await stage()).toBe('CONTACTED')
  })

  it('records it under its own event type, not BOUNCED', async () => {
    await recordTransmissionFailure(env, DRAFT_ID, { error: 'ECONNREFUSED 172.19.0.1:25' })

    expect(await activity(ACTIVITY.BOUNCED)).toHaveLength(0)

    const failures = await activity(ACTIVITY.OUTBOUND_SEND_FAILED)
    expect(failures).toHaveLength(1)

    const metadata = JSON.parse(failures[0].metadata_json)
    expect(metadata.draftId).toBe(DRAFT_ID)
    expect(metadata.error).toContain('ECONNREFUSED')
    // Said in the record itself, so a later reader cannot mistake it for
    // evidence about the address.
    expect(metadata.note).toMatch(/says nothing about whether the address is valid/i)
  })

  it('records a retryable failure without acting on it', async () => {
    // `retryable` is information for a person. Re-offering the draft would
    // break the under-send-rather-than-double-send rule: a send that reported
    // failure may still have reached an MTA.
    const result = await recordTransmissionFailure(env, DRAFT_ID, { error: 'timeout', retryable: true })

    expect(result.retryable).toBe(true)
    expect(result.suppressed).toBe(false)
    expect(await suppression()).toHaveLength(0)
  })

  it('is idempotent, so a retrying transmitter does not spam the timeline', async () => {
    await recordTransmissionFailure(env, DRAFT_ID, { error: 'x' })
    await recordTransmissionFailure(env, DRAFT_ID, { error: 'x' })

    expect(await activity(ACTIVITY.OUTBOUND_SEND_FAILED)).toHaveLength(1)
  })

  it('refuses an unknown draft rather than inventing one', async () => {
    await expect(recordTransmissionFailure(env, 'nope', {})).rejects.toThrow(/not found/i)
  })
})

describe('the draft itself', () => {
  it('is retained with the error attached, and is NOT re-offered to the sender', async () => {
    const { collectOutbox } = await import('./outbox.js')
    const { getDraft } = await import('../repositories/drafts.js')

    // The draft starts exported, which is how collectOutbox knows not to hand
    // it out again.
    await db_markExported()

    await recordTransmissionFailure(env, DRAFT_ID, { error: "Cannot find module 'nodemailer'" })

    const draft = await getDraft(env.DB, DRAFT_ID)
    // Retained for inspection: still there, still exported, error readable.
    expect(draft).not.toBeNull()
    expect(draft.exported).toBe(true)
    expect(draft.transmissionError).toContain('nodemailer')

    // And crucially NOT queued up again. A transmission that reported failure
    // may still have reached an MTA, so re-offering it risks a second send to
    // a stranger.
    const collected = await collectOutbox(env, { limit: 10 })
    expect(collected.messages.map((message) => message.draftId)).not.toContain(DRAFT_ID)
  })
})

describe('a real hard bounce, by contrast', () => {
  it('still suppresses and still moves the lead', async () => {
    // The other half of the guarantee. Separating the two paths must not have
    // weakened the one that is supposed to act.
    const result = await recordBounce(env, DRAFT_ID, {
      kind: 'hard',
      diagnostic: '550 5.1.1 User unknown',
    })

    expect(result.suppressed).toBe(true)

    const entries = await suppression()
    expect(entries).toHaveLength(1)
    expect(entries[0].value).toBe(RECIPIENT)
    expect(entries[0].reason).toBe('hard_bounce')
    expect(await stage()).toBe('NO_CONTACT')
  })

  it('a soft bounce records without suppressing', async () => {
    await recordBounce(env, DRAFT_ID, { kind: 'soft', diagnostic: '452 mailbox full' })

    expect(await suppression()).toHaveLength(0)
    expect(await stage()).toBe('CONTACTED')
  })
})

describe('the two paths are genuinely distinct', () => {
  it('a transmission failure followed by a real bounce behaves as both', async () => {
    await recordTransmissionFailure(env, DRAFT_ID, { error: 'nodemailer missing' })
    expect(await suppression()).toHaveLength(0)

    await recordBounce(env, DRAFT_ID, { kind: 'hard', diagnostic: '550 5.1.1' })
    expect(await suppression()).toHaveLength(1)

    // Both are on the timeline, under different event types, so the sequence
    // is reconstructable afterwards.
    expect(await activity(ACTIVITY.OUTBOUND_SEND_FAILED)).toHaveLength(1)
    expect(await activity(ACTIVITY.BOUNCED)).toHaveLength(1)
  })
})
