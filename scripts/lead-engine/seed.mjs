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
      'Data is ODbL-licensed and openly available. Before enabling, review the current public',
      'instance guidance (https://wiki.openstreetmap.org/wiki/Overpass_API) and the policy of',
      'the exact endpoint configured. The main public instance directs regular commercial use',
      'to self-hosted or paid infrastructure. The adapter is sequential and bounded, but that',
      'does not itself grant permission to use an endpoint.',
      'Attribution: OSM data must be credited where it is displayed publicly. It is not',
      'displayed publicly here — it is internal research evidence only.',
    ].join(' '),
  },
  {
    slug: 'osm-nominatim',
    name: 'OpenStreetMap (Nominatim search)',
    // `search_api`, not a new `osm_nominatim` value, because migration 0012 is
    // already applied to both databases and its CHECK constraint cannot be
    // widened without rebuilding a table that lead_source_runs references by
    // foreign key. The value is accurate anyway - Nominatim is a search API -
    // and nothing dispatches on `type`; the adapter is chosen by `slug`.
    type: 'search_api',
    baseUrl: 'https://nominatim.openstreetmap.org/search',
    policyNotes: [
      'Free, keyless, ODbL-licensed, over the same OpenStreetMap data as Overpass but asking a',
      'free-text question rather than a tag-and-bbox one. Before enabling, read the Nominatim',
      'Usage Policy (https://operations.osmfoundation.org/policies/nominatim/): it caps automated',
      'clients at ONE REQUEST PER SECOND as an absolute limit, requires an identifying',
      'User-Agent, and asks heavy users to self-host. The adapter enforces the interval with a',
      'real delay and keeps the per-run budget small, but that does not itself grant permission.',
      'Note on query phrasing: Nominatim resolves OSM special phrases, so "dentist Austin TX"',
      'and "law firm Houston" return results where "hvac contractor Phoenix" returns none. A',
      'zero-result query is reported per query so it can be rewritten.',
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

    /**
     * MEASURED AGAINST THE LIVE API, 18 September 2026, and kept deliberately
     * short as a result.
     *
     *   real estate agency Austin TX     0 results
     *   property management Austin TX    0 results
     *   estate agent Charlotte NC        0 results
     *   real estate Charlotte NC         3 results, 1 with a website
     *
     * Nominatim resolves OSM special phrases, and this trade has almost no
     * usable mapping. For THIS vertical the Overpass tag query
     * (office=estate_agent) is the right instrument and Nominatim is close to
     * useless — the opposite of the cross-industry campaigns below. Left in
     * only so the per-query yield is visible in the run report rather than
     * assumed.
     */
    nominatim: {
      queries: ['real estate Charlotte NC', 'real estate Austin TX'],
      countryCodes: 'us',
      limit: 40,
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

/**
 * Metro bounding boxes, shared by every campaign below.
 *
 * [south, west, north, east], deliberately tight - a loose box returns a
 * state's worth of results and spends the candidate budget on businesses
 * nowhere near the metro.
 */
const METROS = Object.freeze({
  austin: { name: 'Austin, TX', bbox: [30.1, -97.94, 30.52, -97.56] },
  dallas: { name: 'Dallas, TX', bbox: [32.62, -96.99, 32.99, -96.6] },
  houston: { name: 'Houston, TX', bbox: [29.6, -95.55, 29.88, -95.2] },
  phoenix: { name: 'Phoenix, AZ', bbox: [33.29, -112.32, 33.71, -111.92] },
  charlotte: { name: 'Charlotte, NC', bbox: [35.1, -80.95, 35.39, -80.68] },
})

/**
 * Cross-industry campaigns.
 *
 * WHY THESE EXIST, AND WHY THEIR QUERIES LOOK THE WAY THEY DO.
 *
 * The engine is vertical-agnostic - nothing about an industry lives in its
 * source, only in these config rows. Campaign 001 above is property
 * management, and measuring the free sources against it produced an
 * uncomfortable result: Nominatim returns essentially nothing for that trade,
 * because OSM has no special phrase for it. Restricting discovery to one
 * vertical therefore also restricts it to the source that is hardest to reach
 * for free.
 *
 * Every `nominatim.queries` entry below was RUN against the live API on
 * 18 September 2026 and kept only if it returned businesses carrying a website
 * tag, since a business with no website is dropped downstream. Measured yield,
 * as results / with-a-website:
 *
 *   hotel Charlotte NC        40 / 26      law firm Houston      22 / 17
 *   insurance Dallas TX       40 / 18      dentist Austin TX     26 / 14
 *   pharmacy Austin TX        40 / 18      doctors Phoenix AZ    14 /  4
 *   restaurant Austin TX      12 /  4      car repair Dallas TX   9 /  2
 *
 * Phrasings that measured ZERO were discarded rather than seeded hopefully:
 * accountant, veterinary clinic, hairdresser, estate agent, hvac contractor,
 * plumbing company. If a vertical you want is missing, measure it first - the
 * adapter reports per-query yield precisely so this stays evidence-based.
 *
 * All seeded as DRAFT with schedules disarmed, exactly like Campaign 001.
 * Activating one and arming its schedule remain separate, deliberate acts.
 */
const CROSS_INDUSTRY = [
  {
    name: 'US Legal & Professional Services',
    slug: 'us-legal-professional-services',
    industryLabel: 'Legal and professional services',
    targetIndustries: ['law firm', 'attorney', 'legal services', 'litigation', 'law office'],
    serviceTerms: ['free consultation', 'case evaluation', 'client intake', 'retainer', 'practice areas'],
    disqualifyingKeywords: ['legal directory', 'find a lawyer', 'legal software', 'law school', 'bar association'],
    nominatimQueries: ['law firm Houston', 'law firm Austin TX', 'law firm Dallas TX', 'law firm Charlotte NC'],
    overpassTags: [{ key: 'office', value: 'lawyer' }],
    metroKeys: ['houston', 'austin', 'dallas', 'charlotte'],
  },
  {
    name: 'US Dental & Medical Practices',
    slug: 'us-dental-medical-practices',
    industryLabel: 'Dental and medical practices',
    targetIndustries: ['dental practice', 'dentist', 'family medicine', 'clinic', 'medical practice'],
    serviceTerms: ['book an appointment', 'new patient', 'patient portal', 'insurance accepted', 'emergency visit'],
    disqualifyingKeywords: ['hospital system', 'medical school', 'practice management software', 'dental supplies'],
    nominatimQueries: ['dentist Austin TX', 'dentist Dallas TX', 'dentist Charlotte NC', 'doctors Phoenix AZ'],
    overpassTags: [
      { key: 'amenity', value: 'dentist' },
      { key: 'amenity', value: 'doctors' },
    ],
    metroKeys: ['austin', 'dallas', 'charlotte', 'phoenix'],
  },
  {
    name: 'US Hospitality',
    slug: 'us-hospitality',
    industryLabel: 'Hotels and restaurants',
    targetIndustries: ['hotel', 'inn', 'restaurant', 'bistro', 'hospitality'],
    serviceTerms: ['book a table', 'reservations', 'check availability', 'menu', 'private events'],
    disqualifyingKeywords: ['booking aggregator', 'restaurant directory', 'franchise opportunity', 'food delivery app'],
    nominatimQueries: ['hotel Charlotte NC', 'hotel Austin TX', 'restaurant Austin TX', 'restaurant Charlotte NC'],
    overpassTags: [
      { key: 'tourism', value: 'hotel' },
      { key: 'amenity', value: 'restaurant' },
    ],
    metroKeys: ['charlotte', 'austin', 'dallas', 'houston'],
  },
  {
    name: 'US Local Services & Retail',
    slug: 'us-local-services-retail',
    industryLabel: 'Insurance, pharmacy and vehicle services',
    targetIndustries: ['insurance agency', 'pharmacy', 'auto repair', 'service centre', 'independent agent'],
    serviceTerms: ['get a quote', 'request an appointment', 'refill', 'schedule service', 'walk-ins welcome'],
    disqualifyingKeywords: ['comparison site', 'insurance marketplace', 'lead generation', 'franchise opportunity'],
    nominatimQueries: ['insurance Dallas TX', 'pharmacy Austin TX', 'insurance Charlotte NC', 'car repair Dallas TX'],
    overpassTags: [
      { key: 'office', value: 'insurance' },
      { key: 'amenity', value: 'pharmacy' },
      { key: 'shop', value: 'car_repair' },
    ],
    metroKeys: ['dallas', 'austin', 'charlotte', 'phoenix'],
  },
].map((entry) => ({
  id: randomUUID(),
  name: entry.name,
  slug: entry.slug,
  description: [
    `Cross-industry discovery for ${entry.industryLabel.toLowerCase()}.`,
    'Seeded as a DRAFT with its schedule disarmed, like Campaign 001: activating it and arming',
    'the schedule are separate, deliberate actions. Nominatim queries were measured against the',
    'live API before seeding and only phrasings that returned businesses with websites were kept.',
  ].join(' '),
  countryCode: 'US',
  maxCandidates: 100,
  maxAiReviews: 40,
  config: {
    industryLabel: entry.industryLabel,
    targetIndustries: entry.targetIndustries,
    serviceTerms: entry.serviceTerms,
    disqualifyingKeywords: entry.disqualifyingKeywords,
    metros: entry.metroKeys.map((key) => METROS[key].name.split(',')[0]),
    overpass: {
      areas: entry.metroKeys.map((key) => METROS[key]),
      tags: entry.overpassTags,
    },
    nominatim: {
      queries: entry.nominatimQueries,
      countryCodes: 'us',
      limit: 40,
    },
    // No `brave` block: these campaigns are designed to run without a paid
    // search key at all. Adding one later is a config edit, not a code change.
  },
}))

/** Campaign 001 first, because the dry-run documentation refers to it by name. */
const CAMPAIGNS = [CAMPAIGN, ...CROSS_INDUSTRY]

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

// Every campaign is seeded 'draft' with schedule_enabled = 0. Neither value is
// derived from the campaign definition, so no future edit to one of those
// objects can arm a schedule by accident.
for (const campaign of CAMPAIGNS) {
  lines.push(
    `INSERT OR IGNORE INTO lead_campaigns
  (id, name, slug, description, status, country_code, config_json,
   max_candidates, max_ai_reviews, schedule_enabled, schedule_cron,
   created_by, created_at, updated_at)
VALUES (${sql(campaign.id)}, ${sql(campaign.name)}, ${sql(campaign.slug)}, ${sql(campaign.description)},
        'draft', ${sql(campaign.countryCode)}, ${sql(JSON.stringify(campaign.config))},
        ${campaign.maxCandidates}, ${campaign.maxAiReviews}, 0, NULL,
        'seed-script', ${sql(now)}, ${sql(now)});`,
  )
  lines.push('')
}

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
