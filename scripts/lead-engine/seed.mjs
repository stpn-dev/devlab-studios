#!/usr/bin/env node
/**
 * Seeds the Lead Intelligence Engine's registry and the first campaign.
 *
 * Emits SQL on stdout rather than writing to a database, matching how the
 * existing CMS seeds work (scripts/cms/generate-insights-seed.mjs). That means
 * the operator sees exactly what will be written before anything is, and the
 * same output can be applied to local, preview and production deliberately
 * rather than by a script deciding for them.
 *
 * WHAT THIS SEEDS, AND WHAT IT DELIBERATELY DOES NOT:
 *
 *   - Sources are registered but NOT enabled, NOT automation-approved, and
 *     their policy status is `unreviewed`. Registering a source is not the same
 *     as having read its terms, and only a human can do the second one. The
 *     discovery gate refuses an unapproved source, so a seeded database
 *     discovers nothing.
 *
 *   - Campaign 001 is created as a DRAFT with its schedule DISARMED. Both
 *     switches have to be turned on by a person, in the admin, on purpose.
 *     Seeding a campaign that immediately started crawling other people's
 *     websites would be exactly the wrong default.
 *
 * Usage:
 *   node scripts/lead-engine/seed.mjs > scripts/lead-engine/seed.sql
 *   npx wrangler d1 execute devlab-studios-cms --local --file scripts/lead-engine/seed.sql
 *
 * Applying it to production is a deliberate, separate step — see
 * docs/lead-engine/deployment.md.
 */

import { randomUUID } from 'node:crypto'

const now = new Date().toISOString()

/** SQL string literal with single quotes escaped. */
function sql(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * The discovery sources this engine knows how to read.
 *
 * `enabled`, `automation_allowed` and `crawl_allowed` are all 0 and
 * `policy_status` is 'unreviewed' for every one of them. The policy notes below
 * are a STARTING POINT for the human review, not the review itself — they say
 * what to go and check, and the reviewer records what they found.
 */
const SOURCES = [
  {
    slug: 'osm-overpass',
    name: 'OpenStreetMap (Overpass API)',
    type: 'osm_overpass',
    baseUrl: 'https://overpass-api.de/api/interpreter',
    policyNotes: [
      'Data is ODbL-licensed and openly available. Before enabling, confirm the current',
      'Overpass API usage policy (https://operations.osmfoundation.org/policies/api/) and that',
      'our request volume and rate are within it. The adapter is sequential and bounded by',
      'USAGE_LIMITS.overpass_requests, but the ceiling is ours to justify.',
      'Attribution: OSM data must be credited where it is displayed publicly. It is not',
      'displayed publicly here — it is internal research evidence only.',
    ].join(' '),
  },
  {
    slug: 'brave-search',
    name: 'Brave Search API',
    type: 'search_api',
    baseUrl: 'https://api.search.brave.com/res/v1/web/search',
    policyNotes: [
      'A paid, documented API with its own terms. Before enabling, confirm the plan permits',
      'this use and note the request quota. The adapter is entirely optional: with no API key',
      'the engine works and simply discovers fewer candidates. Snippets are never forwarded',
      'to Workers AI — Brave is used for domain discovery only.',
    ].join(' '),
  },
  {
    slug: 'manual-import',
    name: 'Manual import (CSV / domain list)',
    type: 'manual_import',
    baseUrl: null,
    policyNotes: [
      'Candidates an operator pastes in by hand. No third-party terms apply to the import',
      'itself, but the SOURCE of the list does matter: do not import a purchased list.',
      'Imported rows go through the same normalization, deduplication and compliance gate as',
      'anything an automated adapter found.',
    ].join(' '),
  },
]

/**
 * Discovery Campaign 001.
 *
 * Property-management vocabulary lives HERE, in campaign configuration, and
 * nowhere in the engine's source. That is the whole point of the config column:
 * the engine is vertical-agnostic and this row is what makes one run about
 * property management.
 *
 * Bounding boxes are [south, west, north, east] and cover the city proper plus
 * immediate metro, deliberately tight — a loose box returns a state's worth of
 * results and spends the candidate budget on businesses nowhere near the metro.
 */
const CAMPAIGN = {
  id: randomUUID(),
  name: 'US Property Management — Dry Run',
  slug: 'us-property-management-dry-run',
  description: [
    'The first production-like test of the Lead Intelligence Engine. Seeded as a DRAFT with',
    'its schedule disarmed: activating it and arming the schedule are separate, deliberate',
    'actions. The first run is expected to stop at READY_TO_CONTACT with no email sent, so',
    'that business quality, crawler accuracy, signal accuracy, score quality, AI opportunity',
    'quality and contact provenance can all be inspected before anyone is contacted.',
  ].join(' '),
  countryCode: 'US',
  maxCandidates: 100,
  maxAiReviews: 40,
  config: {
    industryLabel: 'Property management',

    // Matched against the crawled page text to award TARGET_INDUSTRY.
    targetIndustries: [
      'property management',
      'property manager',
      'rental management',
      'hoa management',
      'community association management',
      'residential property management',
    ],

    // Two or more of these present indicates a business with several distinct
    // service lines, which usually means several distinct intake processes.
    serviceTerms: [
      'tenant screening',
      'rent collection',
      'maintenance coordination',
      'lease renewal',
      'property marketing',
      'eviction',
      'inspection',
      'owner statement',
      'hoa management',
      'vendor management',
      'move-in',
      'move-out',
    ],

    // A match here subtracts from the ICP score. These are businesses that use
    // the same words but are not who this campaign is for.
    disqualifyingKeywords: [
      'we buy houses',
      'cash for your home',
      'mortgage broker',
      'title insurance',
      'real estate school',
      'property management software',
      'property management platform',
      'franchise opportunity',
    ],

    metros: ['Austin', 'Dallas', 'Tampa', 'Phoenix', 'Charlotte'],

    overpass: {
      areas: [
        { name: 'Austin, TX', bbox: [30.1, -97.94, 30.52, -97.56] },
        { name: 'Dallas, TX', bbox: [32.62, -96.99, 32.99, -96.6] },
        { name: 'Tampa, FL', bbox: [27.86, -82.58, 28.08, -82.34] },
        { name: 'Phoenix, AZ', bbox: [33.29, -112.32, 33.71, -111.92] },
        { name: 'Charlotte, NC', bbox: [35.1, -80.95, 35.39, -80.68] },
      ],
      // OSM's own tagging for this trade. `office=estate_agent` is the broadest
      // and catches most of them; the other two are less consistently applied
      // but cost nothing to include in the same query.
      tags: [
        { key: 'office', value: 'estate_agent' },
        { key: 'office', value: 'property_management' },
        { key: 'shop', value: 'estate_agent' },
      ],
    },

    brave: {
      // One request each, and only used if a Brave key is configured.
      queries: [
        '"property management company" "Austin Texas"',
        '"rental property management" "Dallas Texas"',
        '"HOA management company" "Tampa Florida"',
        '"property management" "Phoenix Arizona"',
        '"property management company" "Charlotte North Carolina"',
      ],
      country: 'US',
      count: 20,
    },
  },
}

const lines = []

lines.push('-- Lead Intelligence Engine seed.')
lines.push('-- Generated by scripts/lead-engine/seed.mjs. Safe to re-run: every')
lines.push('-- statement is INSERT OR IGNORE, so applying it twice changes nothing.')
lines.push('--')
lines.push('-- SOURCES ARE REGISTERED BUT DISABLED AND UNREVIEWED.')
lines.push('-- THE CAMPAIGN IS A DRAFT WITH ITS SCHEDULE DISARMED.')
lines.push('-- Nothing here causes the engine to discover, crawl, or contact anyone.')
lines.push('')

for (const source of SOURCES) {
  lines.push(
    `INSERT OR IGNORE INTO lead_sources
  (id, name, slug, type, base_url, enabled, automation_allowed, crawl_allowed,
   policy_status, policy_notes, parser_version, created_at, updated_at)
VALUES (${sql(randomUUID())}, ${sql(source.name)}, ${sql(source.slug)}, ${sql(source.type)}, ${sql(source.baseUrl)},
        0, 0, 0, 'unreviewed', ${sql(source.policyNotes)}, 1, ${sql(now)}, ${sql(now)});`,
  )
  lines.push('')
}

lines.push(
  `INSERT OR IGNORE INTO lead_campaigns
  (id, name, slug, description, status, country_code, config_json,
   max_candidates, max_ai_reviews, schedule_enabled, schedule_cron,
   created_by, created_at, updated_at)
VALUES (${sql(CAMPAIGN.id)}, ${sql(CAMPAIGN.name)}, ${sql(CAMPAIGN.slug)}, ${sql(CAMPAIGN.description)},
        'draft', ${sql(CAMPAIGN.countryCode)}, ${sql(JSON.stringify(CAMPAIGN.config))},
        ${CAMPAIGN.maxCandidates}, ${CAMPAIGN.maxAiReviews}, 0, NULL,
        'seed-script', ${sql(now)}, ${sql(now)});`,
)
lines.push('')

/**
 * The business identity the US compliance profile requires.
 *
 * Seeded EMPTY on purpose. The US profile's sender-identity and postal-address
 * checks fail until a human fills these in, which holds every US lead at
 * `needs_human_review` rather than letting the engine invent an address for a
 * commercial email. Fill them in from the admin's CRM Settings screen.
 */
lines.push(
  `INSERT OR IGNORE INTO lead_settings (key, value_json, is_secret, updated_by, updated_at)
VALUES ('business.identity', ${sql(
    JSON.stringify({
      legalName: 'DevLab Studios',
      senderName: '',
      senderEmail: '',
      postalAddress: '',
      city: '',
      region: '',
      postalCode: '',
      countryCode: '',
      website: 'https://www.devlabstudios.com',
    }),
  )}, 0, 'seed-script', ${sql(now)});`,
)
lines.push('')

lines.push('-- Next steps (all manual, all in the admin):')
lines.push('--   1. Read each source\'s terms. Record the review on Lead CRM > Sources.')
lines.push('--   2. Enable the sources you approved, and allow automation on them.')
lines.push('--   3. Fill in business.identity on Lead CRM > CRM Settings. The US')
lines.push('--      compliance profile holds every lead until the postal address is set.')
lines.push('--   4. Set LEAD_ENGINE_ENABLED / LEAD_DISCOVERY_ENABLED / LEAD_CRAWLER_ENABLED')
lines.push('--      / LEAD_AI_ENABLED as Worker vars.')
lines.push('--   5. Activate the campaign, then use "Dry run" before "Run discovery".')
lines.push('--   6. Leave LEAD_CAMPAIGN_SCHEDULES_ENABLED off until the dry run looks right.')
lines.push('-- See docs/lead-engine/dry-run.md.')

process.stdout.write(`${lines.join('\n')}\n`)
