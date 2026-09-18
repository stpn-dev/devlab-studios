import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The seed has to actually land, not merely parse.
 *
 * Every statement it emits is `INSERT OR IGNORE`, which is right for a seed
 * that may be re-run — and which also swallows a CHECK-constraint violation
 * without a word. That is not hypothetical: the `osm-nominatim` source was
 * first written with `type: 'osm_nominatim'`, a value migration 0012's CHECK
 * does not permit, and the row was silently discarded. The generated SQL was
 * valid, the script exited 0, and one of four sources simply never existed.
 *
 * So this applies the real migration and the real generated seed to a real
 * SQLite and then counts what survived. Anything that asserts on the .sql text
 * rather than on the resulting rows would have missed it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(resolve(here, '../../migrations/0012_lead_intelligence_engine.sql'), 'utf8')
const seed = readFileSync(resolve(here, './seed.sql'), 'utf8')

/** Slugs the seed script defines, kept here so a dropped row is a failure. */
const EXPECTED_SOURCES = ['osm-overpass', 'osm-nominatim', 'brave-search', 'manual-import']

let db

beforeAll(() => {
  db = new DatabaseSync(':memory:')
  db.exec(migration)
  db.exec(seed)
})

const all = (sql) => db.prepare(sql).all()

describe('the generated seed', () => {
  it('lands every source it defines, none silently dropped by a CHECK', () => {
    const slugs = all('SELECT slug FROM lead_sources ORDER BY slug').map((row) => row.slug)

    expect(slugs.sort()).toEqual([...EXPECTED_SOURCES].sort())
  })

  it('leaves every source disabled and unreviewed, because policy review is a human act', () => {
    const rows = all('SELECT slug, enabled, automation_allowed, crawl_allowed, policy_status FROM lead_sources')

    for (const row of rows) {
      expect(row.enabled, `${row.slug} is enabled`).toBe(0)
      expect(row.automation_allowed, `${row.slug} allows automation`).toBe(0)
      expect(row.crawl_allowed, `${row.slug} allows crawling`).toBe(0)
      expect(row.policy_status, `${row.slug} is pre-approved`).toBe('unreviewed')
    }
  })

  it('seeds campaigns across several industries, not one vertical', () => {
    // The engine is vertical-agnostic and the campaign row is what makes a run
    // about an industry. One seeded vertical means one addressable market.
    const industries = all("SELECT json_extract(config_json, '$.industryLabel') AS label FROM lead_campaigns")
      .map((row) => row.label)
      .filter(Boolean)

    expect(industries.length).toBeGreaterThanOrEqual(4)
    expect(new Set(industries).size).toBe(industries.length)
  })

  it('leaves every campaign a disarmed draft', () => {
    const rows = all('SELECT slug, status, schedule_enabled, schedule_cron FROM lead_campaigns')

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.status, `${row.slug} is not a draft`).toBe('draft')
      // The flag and the per-campaign switch are independent by design, and
      // this is the one that must never arrive pre-armed from a script.
      expect(row.schedule_enabled, `${row.slug} has an armed schedule`).toBe(0)
      expect(row.schedule_cron, `${row.slug} has a cron`).toBeNull()
    }
  })

  it('gives every campaign at least one configured discovery source', () => {
    const rows = all('SELECT slug, config_json FROM lead_campaigns')

    for (const row of rows) {
      const config = JSON.parse(row.config_json)
      const overpassReady = (config.overpass?.areas?.length ?? 0) > 0 && (config.overpass?.tags?.length ?? 0) > 0
      const nominatimReady = (config.nominatim?.queries?.length ?? 0) > 0

      expect(overpassReady || nominatimReady, `${row.slug} configures no usable source`).toBe(true)
    }
  })

  it('does not make any campaign depend on a paid search key', () => {
    // Discovery has to work on the free sources alone. A campaign whose only
    // configured source were Brave would silently discover nothing without a
    // key somebody has to pay for.
    const rows = all('SELECT slug, config_json FROM lead_campaigns')

    for (const row of rows) {
      const config = JSON.parse(row.config_json)
      const freeSource =
        (config.overpass?.areas?.length ?? 0) > 0 || (config.nominatim?.queries?.length ?? 0) > 0

      expect(freeSource, `${row.slug} can only discover via a paid source`).toBe(true)
    }
  })

  it('leaves the business identity empty, so no address is invented', () => {
    const row = db.prepare("SELECT value_json FROM lead_settings WHERE key = 'business.identity'").get()
    const identity = JSON.parse(row.value_json)

    expect(identity.postalAddress).toBe('')
    expect(identity.senderEmail).toBe('')
  })

  it('is idempotent, because a seed gets re-run', () => {
    const before = all('SELECT COUNT(*) AS n FROM lead_campaigns')[0].n

    db.exec(seed)

    expect(all('SELECT COUNT(*) AS n FROM lead_campaigns')[0].n).toBe(before)
  })
})
