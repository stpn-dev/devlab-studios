/**
 * Every tunable number in the Lead Intelligence Engine, in one place.
 *
 * Nothing else in src/lead-engine/ may contain a bare threshold, weight, page
 * cap or budget. The rule exists because the alternative — a 60 here and a
 * 0.7 there — makes "why was this lead rejected" unanswerable and makes
 * changing the qualification bar a code search rather than a settings edit.
 *
 * These are DEFAULTS. A row in the `lead_settings` table overrides one at
 * runtime (see src/lead-engine/config/settings.js); the resolved value is what
 * the engine uses and what the admin Settings screen edits.
 */

/**
 * Bumped whenever a weight or threshold below changes in a way that would make
 * two scores incomparable. Persisted on every `lead_scores` row, so an old
 * score is always readable against the rules that produced it.
 */
export const RULESET_VERSION = 1

/** Bumped when signal extraction changes. Persisted on every `lead_signals` row. */
export const EXTRACTOR_VERSION = 1

/**
 * Routing thresholds against the total rule score.
 *
 * Read as half-open bands: [0, hold) is not qualified, [hold, aiReview) is
 * hold, [aiReview, priorityAiReview) goes to AI, and >= priorityAiReview goes
 * to AI first. Expressed as lower bounds rather than ranges so there is exactly
 * one number per boundary and no possibility of a gap or an overlap.
 */
export const SCORE_THRESHOLDS = Object.freeze({
  hold: 40,
  aiReview: 60,
  priorityAiReview: 75,
})

/**
 * Signal weights, grouped by the scoring category each contributes to.
 *
 * A signal that is not listed here scores zero — adding an extractor does not
 * silently change every existing lead's score until a weight is chosen for it
 * deliberately.
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  icp_fit: Object.freeze({
    TARGET_INDUSTRY: 15,
    TARGET_COUNTRY: 5,
    TARGET_METRO: 5,
    MULTIPLE_SERVICES: 5,
    MULTIPLE_LOCATIONS: 5,
    MULTIPLE_AUDIENCES: 5,
    DISQUALIFYING_KEYWORD: -25,
  }),
  workflow_opportunity: Object.freeze({
    MANUAL_WORKFLOW_LANGUAGE: 10,
    MULTIPLE_MANUAL_WORKFLOWS: 5,
    DOWNLOADABLE_FORM: 8,
    PDF_WORKFLOW: 5,
    APPLICATION_FORM: 6,
    QUOTE_REQUEST_FORM: 5,
    CLIENT_PORTAL: 4,
    NO_VISIBLE_SCHEDULING: 5,
    NO_VISIBLE_CHAT: 3,
    // A business already running a CRM is not disqualified — the observed
    // opportunity is usually the gap between the CRM and the manual steps
    // around it — but it is a weaker signal than a business with none.
    CRM_DETECTED: -3,
    BOOKING_DETECTED: -6,
  }),
  contactability: Object.freeze({
    PUBLIC_BUSINESS_EMAIL: 10,
    CONTACT_FORM: 4,
    PUBLIC_PHONE: 3,
    CONTACT_PAGE_REACHABLE: 3,
  }),
  data_quality: Object.freeze({
    ACTIVE_WEBSITE: 5,
    RESOLVED_CANONICAL_DOMAIN: 3,
    MULTIPLE_PAGES_ANALYZED: 3,
    STRUCTURED_DATA_PRESENT: 2,
    CORROBORATED_BY_TWO_SOURCES: 2,
  }),
})

/**
 * Human-readable labels for the score-explanation list on the lead detail
 * screen. Keyed by the same codes as SIGNAL_WEIGHTS so a weight can never
 * exist without a label to show for it (asserted by a unit test).
 */
export const SIGNAL_LABELS = Object.freeze({
  TARGET_INDUSTRY: 'Matches a campaign target industry',
  TARGET_COUNTRY: 'In the campaign target country',
  TARGET_METRO: 'In a campaign target metro',
  MULTIPLE_SERVICES: 'Advertises multiple distinct services',
  MULTIPLE_LOCATIONS: 'Operates in multiple locations',
  MULTIPLE_AUDIENCES: 'Serves multiple customer types',
  DISQUALIFYING_KEYWORD: 'Matches a campaign disqualifying keyword',
  MANUAL_WORKFLOW_LANGUAGE: 'Public pages describe a manual intake step',
  MULTIPLE_MANUAL_WORKFLOWS: 'More than one manual intake step described',
  DOWNLOADABLE_FORM: 'Offers a downloadable form',
  PDF_WORKFLOW: 'Routes a process through a PDF',
  APPLICATION_FORM: 'Publishes an application form',
  QUOTE_REQUEST_FORM: 'Publishes a quote/consultation request form',
  CLIENT_PORTAL: 'Links to a customer, owner, tenant or client portal',
  NO_VISIBLE_SCHEDULING: 'No public booking or scheduling found',
  NO_VISIBLE_CHAT: 'No chat widget found',
  CRM_DETECTED: 'A CRM or marketing platform is publicly detectable',
  BOOKING_DETECTED: 'Public booking or scheduling is already in place',
  PUBLIC_BUSINESS_EMAIL: 'Publishes a business email address',
  CONTACT_FORM: 'Publishes a contact form',
  PUBLIC_PHONE: 'Publishes a phone number',
  CONTACT_PAGE_REACHABLE: 'Contact page was reachable',
  ACTIVE_WEBSITE: 'Website is live and served real content',
  RESOLVED_CANONICAL_DOMAIN: 'Canonical domain resolved cleanly',
  MULTIPLE_PAGES_ANALYZED: 'More than one page analyzed',
  STRUCTURED_DATA_PRESENT: 'Publishes structured business data',
  CORROBORATED_BY_TWO_SOURCES: 'Corroborated by two independent sources',
})

/** Crawler policy. See docs/lead-engine/crawler.md for the reasoning behind each. */
export const CRAWLER = Object.freeze({
  /** Pages per site per crawl run. Four covers /, contact, services, about. */
  maxPagesPerSite: 4,
  /** A page larger than this is abandoned mid-stream rather than buffered. */
  maxResponseBytes: 1_500_000,
  requestTimeoutMs: 10_000,
  maxRedirects: 3,
  /** Minimum gap between two requests to the same host, within one run. */
  perDomainDelayMs: 1_000,
  /** Sites crawled concurrently. Deliberately small — see CONCURRENCY below. */
  concurrency: 2,
  maxRetries: 2,
  retryBaseDelayMs: 2_000,
  /** Characters of supporting evidence retained per signal. */
  evidenceExcerptLength: 240,
  userAgent: 'DevLabResearchBot/1.0 (+https://www.devlabstudios.com/crawler)',
  acceptedContentTypes: Object.freeze(['text/html', 'application/xhtml+xml']),
  /**
   * Below this many characters of extracted text, a 200 OK is treated as an
   * empty render — the trigger for considering Browser Run.
   */
  clientRenderedTextThreshold: 400,
})

/**
 * Candidate paths, in priority order. The crawler takes the homepage plus the
 * highest-priority discovered links up to `maxPagesPerSite`; it does not fetch
 * all of these.
 */
export const CRAWL_PATH_PRIORITY = Object.freeze([
  '/',
  '/contact',
  '/contact-us',
  '/services',
  '/about',
  '/about-us',
  '/owners',
  '/team',
  '/book',
  '/request-quote',
  '/pricing',
  '/locations',
])

/** Global daily budgets. Campaign-level caps apply on top; the lower wins. */
export const USAGE_LIMITS = Object.freeze({
  discovery_candidates: 200,
  crawl_pages: 800,
  browser_runs: 20,
  ai_reviews: 60,
  /**
   * Workers AI neurons. Advisory: models do not all report usage, so this
   * bounds what we can measure, not what we can spend. See
   * docs/lead-engine/workers-ai.md.
   */
  ai_neurons: 5_000,
  brave_requests: 100,
  overpass_requests: 40,
  /**
   * Low on purpose. Nominatim's usage policy caps automated clients at one
   * request per second and asks heavy users to self-host, so this is a budget
   * for a discovery run rather than for bulk geocoding.
   */
  nominatim_requests: 24,
  zoho_api_calls: 500,
})

/** Monthly ceiling, checked alongside the daily one for discovery only. */
export const MONTHLY_DISCOVERY_LIMIT = 3_000

/**
 * Concurrency, per external dependency.
 *
 * All small. Overpass is a donated public service with a documented request
 * etiquette, Brave and Zoho are metered, and Workers AI is sequential in the
 * digest for the same reason it is here: these are I/O-bound calls against a
 * daily allocation, and parallelism buys seconds while costing the ability to
 * stop cleanly when the allocation runs out.
 */
export const CONCURRENCY = Object.freeze({
  crawl: 2,
  ai: 1,
  overpass: 1,
  // One at a time AND spaced by NOMINATIM.minRequestIntervalMs — the policy is
  // one request per second, which concurrency alone cannot honour.
  nominatim: 1,
  brave: 2,
  zoho: 1,
})

/** Durable job runner. */
export const JOBS = Object.freeze({
  /** Jobs drained per cron tick. Bounded by the Worker's CPU budget. */
  batchSize: 10,
  /** A claim older than this is reclaimable — covers a Worker dying mid-job. */
  leaseSeconds: 300,
  maxAttempts: 3,
  /** attempt N waits backoffBaseSeconds * 2^(N-1), capped. */
  backoffBaseSeconds: 60,
  backoffMaxSeconds: 3_600,
})

/** Workers AI. */
export const AI = Object.freeze({
  /**
   * The same model the Insights digest uses, and for the same reason: it is in
   * this account's `wrangler ai models list`. The unquantized variant is not,
   * and answers in a different response shape.
   */
  model: '@cf/meta/llama-3.1-8b-instruct-fp8',
  maxTokens: Object.freeze({
    opportunity_review: 700,
    outreach_draft: 500,
    reply_analysis: 600,
    reply_draft: 500,
  }),
  temperature: Object.freeze({
    opportunity_review: 0.1,
    outreach_draft: 0.4,
    reply_analysis: 0.1,
    reply_draft: 0.4,
  }),
  /** Retries on a malformed/unparseable answer, before recording invalid_output. */
  maxParseRetries: 1,
  /** Below this, an AI-qualified lead still does not reach the review queue. */
  minConfidenceForOutreach: 0.6,
  /** Raw output bytes retained when validation rejects an answer. */
  rawOutputRetentionChars: 2_000,
})

/** Contact discovery and validation. */
export const CONTACTS = Object.freeze({
  /**
   * Role-address local parts, in preference order. A business address is
   * preferred over a named one: it is unambiguously published for business
   * contact, and it minimizes the personal data this system holds.
   */
  preferredLocalParts: Object.freeze([
    'hello', 'info', 'contact', 'sales', 'operations', 'admin', 'enquiries', 'inquiries', 'office',
  ]),
  /** Never stored — these are not business-development contacts. */
  excludedLocalParts: Object.freeze([
    'abuse', 'postmaster', 'noreply', 'no-reply', 'donotreply', 'privacy', 'dmca',
    'security', 'webmaster', 'hostmaster', 'unsubscribe', 'legal', 'careers', 'jobs',
  ]),
  maxContactsPerLead: 5,
  /** DNS-over-HTTPS resolver for the MX lookup. */
  dohEndpoint: 'https://cloudflare-dns.com/dns-query',
  dohTimeoutMs: 5_000,
})

/** Zoho Mail API. */
export const ZOHO = Object.freeze({
  defaultApiBaseUrl: 'https://mail.zoho.com/api',
  accountsBaseUrl: 'https://accounts.zoho.com',
  requestTimeoutMs: 15_000,
  /** Messages examined per folder per sync run. */
  syncPageSize: 50,
  /**
   * The cursor is rewound by this much on each run. Mail providers order by a
   * server timestamp that can move slightly, and a message arriving during the
   * previous run's read window would otherwise be skipped permanently. The
   * overlap is safe because import is idempotent on provider_message_id.
   */
  syncOverlapMinutes: 10,
  /** Per-message body retained. Longer bodies are truncated and flagged. */
  maxBodyChars: 20_000,
})

/** First-party tracking. */
export const TRACKING = Object.freeze({
  tokenBytes: 32,
  defaultExpiryDays: 180,
  /**
   * Redirect destinations are restricted to these hosts. An open redirect
   * therefore requires changing code, not just a database row.
   */
  allowedHosts: Object.freeze(['www.devlabstudios.com', 'devlabstudios.com']),
  /** How long a click stays eligible to be attributed to a later form submit. */
  attributionWindowDays: 30,
  attributionCookieName: 'devlab_ref',
})

/**
 * The `business.identity` fields that must be filled before outreach is
 * possible, split by what each group unblocks.
 *
 * Defined here rather than in compliance/evaluate.js because two callers need
 * the same list: the compliance evaluator, which blocks an individual lead, and
 * config/readiness.js, which tells the operator up front that no lead will ever
 * clear review. Two copies of this list drifting apart would mean the dashboard
 * reporting ready while every lead blocks.
 */
export const BUSINESS_IDENTITY_FIELDS = Object.freeze({
  /** Needed to address a message at all. */
  sender: Object.freeze(['senderName', 'senderEmail']),
  /** Needed for the US profile's postal-address requirement. */
  postal: Object.freeze(['postalAddress', 'city', 'region', 'postalCode', 'countryCode']),
})

/**
 * The effective defaults as a flat key/value map, which is the shape
 * `lead_settings` overrides and the Settings screen edits.
 */
/**
 * Outbound sending, for the external sender that collects from the outbox.
 *
 * NOTHING IN THIS CODEBASE SENDS. These bound what an external automation is
 * allowed to collect — see services/outbox.js.
 *
 * The daily limit is deliberately below the 30-50 per inbox per day that cold
 * email guidance treats as steady state, because a domain with no sending
 * history has to be warmed first: roughly 5-10 a day for a week, then 10-20,
 * and only then higher. Raising this before the domain is warm is how a
 * sending reputation is lost, and it is not recoverable by slowing down later.
 */
export const OUTREACH = Object.freeze({
  dailySendLimit: 10,
  /** Per collection call, however many the caller asks for. */
  maxPerCollection: 10,
})

export const DEFAULT_SETTINGS = Object.freeze({
  'scoring.thresholds': SCORE_THRESHOLDS,
  'scoring.weights': SIGNAL_WEIGHTS,
  'crawler.limits': CRAWLER,
  'usage.daily': USAGE_LIMITS,
  'usage.monthlyDiscovery': MONTHLY_DISCOVERY_LIMIT,
  'concurrency': CONCURRENCY,
  'ai.config': AI,
  'contacts.config': CONTACTS,
  'zoho.config': ZOHO,
  'tracking.config': TRACKING,
  'outreach.sending': OUTREACH,
  /**
   * Sender identity used in outreach drafts and required by the US compliance
   * profile. Empty by default — the US profile blocks review until it is set,
   * rather than this system inventing a postal address.
   */
  'business.identity': Object.freeze({
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
  'crawler.identity': Object.freeze({
    userAgent: CRAWLER.userAgent,
    infoUrl: 'https://www.devlabstudios.com/crawler',
  }),
})
