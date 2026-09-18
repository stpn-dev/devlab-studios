/**
 * Which operational checks apply in which market.
 *
 * SCOPE, stated plainly and deliberately first: this module — and everything
 * else under src/lead-engine/compliance/ — provides OPERATIONAL SAFEGUARDS,
 * PROVENANCE and AUDITABILITY. It is NOT a legal-decision engine. It does not
 * and cannot determine whether a given message is lawful, it gives no legal
 * advice, and neither this code nor any screen it feeds may claim that outreach
 * is legally compliant. What it can honestly say is narrower and still useful:
 * "these configured checks were run against this lead, here is which ones
 * passed, here is the evidence, and here is who reviewed it".
 *
 * Manual sending is NOT treated as automatically exempt. A human pressing send
 * in a mail client is still commercial email and still involves personal data;
 * the checks below apply to a hand-written message exactly as they apply to a
 * generated one. The engine drafts rather than sends for operational reasons,
 * not because drafting moves the work outside the rules that apply to it.
 *
 * A profile is a NAMED SET OF CHECKS, not a statute. `us-can-spam-operational`
 * means "the operational habits we keep in the US market, informed by CAN-SPAM"
 * — it does not mean "CAN-SPAM compliant". The naming is intentional.
 */

/**
 * The full vocabulary of checks, defined once so a profile references a check
 * rather than restating it. Two markets that need the same check get the same
 * key, the same wording on screen, and the same evaluator — which is what makes
 * "why was this lead blocked" mean the same thing in every market.
 */
const CHECK_DEFINITIONS = Object.freeze({
  recipient_not_suppressed: {
    label: 'Recipient is not suppressed',
    description:
      'Neither the address nor its domain appears in the suppression registry. This is the hard '
      + 'boundary on outreach: a match here stops the lead regardless of anything else.',
  },
  not_do_not_contact: {
    label: 'Lead is not marked do-not-contact',
    description:
      'The lead has not been moved to a do-not-contact, unsubscribed or no-contact stage by a '
      + 'person or by an inbound opt-out.',
  },
  sender_identity_configured: {
    label: 'Sender identity is configured',
    description:
      'A sender name and sender address are set in business identity settings, so the message '
      + 'identifies who is actually writing. The engine will not invent either.',
  },
  postal_address_configured: {
    label: 'Business postal address is configured',
    description:
      'A full postal address — street, city, region, postal code and country — is set, so a '
      + 'physical address can be shown in the message. The engine will not invent one.',
  },
  contact_provenance_recorded: {
    label: 'Contact provenance is recorded',
    description:
      'The stored contact carries the URL it was observed on, what kind of page that was, and a '
      + 'record that the address was published publicly. An address with no provenance cannot be '
      + 'explained later and is not usable.',
  },
  opt_out_mechanism_present: {
    label: 'Opt-out mechanism is present',
    description:
      'An opt-out instruction can be produced for this sender, and — when a draft is being '
      + 'reviewed — that instruction is actually in the draft text.',
  },
  legal_basis_recorded: {
    label: 'Legal basis for processing is recorded',
    description:
      'A person has written down which lawful basis this outreach relies on. The system records '
      + 'the assertion and who made it; it does not evaluate whether the basis is sound.',
  },
  privacy_review_recorded: {
    label: 'Privacy review is recorded',
    description:
      'A named reviewer has recorded a privacy review and a reference to the assessment held '
      + 'outside this system. Absence means the review has not happened yet, not that it failed.',
  },
  objection_handling_available: {
    label: 'Objection handling is available',
    description:
      'A recipient has a working, stated route to object or withdraw, and that route lands in the '
      + 'suppression registry rather than in someone\'s inbox rules.',
  },
  market_profile_configured: {
    label: 'A profile is configured for this market',
    description:
      'No country profile exists for this lead\'s market, so no market-specific checks could be '
      + 'run. This check can only be satisfied by adding a profile — it never passes by default.',
  },
})

/**
 * Checks whose failure is a hard boundary rather than a configuration gap.
 *
 * Kept as a list here rather than as a flag on each check entry because the
 * distinction belongs to the check itself, not to the profile that uses it:
 * suppression means the same thing in every market, and no profile should be
 * able to demote it to "someone should look at this".
 */
export const HARD_BOUNDARY_CHECK_KEYS = Object.freeze(['recipient_not_suppressed', 'not_do_not_contact'])

/**
 * Every configured market, one entry each.
 *
 * Adding a market is adding one object to this array — the profile map, the
 * lookup and the fallback all derive from it. Adding a market does NOT mean the
 * market is understood; it means someone chose which checks to run there and
 * can be asked why.
 *
 * `required: true` on every check today is a real value, not a placeholder: a
 * check we would not act on is not worth recording, and the field is carried
 * through to the stored evaluation so the lead detail screen can separate "this
 * blocked the lead" from "this is context".
 */
const MARKETS = Object.freeze([
  {
    countryCode: 'US',
    key: 'us-can-spam-operational',
    label: 'United States — operational safeguards',
    description:
      'Operational safeguards for US outreach, informed by CAN-SPAM: say honestly who is writing, '
      + 'show a real postal address, offer a working opt-out, honour it, and be able to show where '
      + 'the address came from. Not a compliance certification.',
    checks: Object.freeze([
      { key: 'sender_identity_configured', required: true },
      { key: 'postal_address_configured', required: true },
      { key: 'contact_provenance_recorded', required: true },
      { key: 'opt_out_mechanism_present', required: true },
      { key: 'recipient_not_suppressed', required: true },
      { key: 'not_do_not_contact', required: true },
    ]),
  },
  {
    countryCode: 'PH',
    key: 'ph-dpa-operational',
    label: 'Philippines — operational safeguards',
    description:
      'Operational safeguards for Philippine outreach, informed by the Data Privacy Act: record a '
      + 'lawful basis and who asserted it, record a privacy review, keep provenance for every '
      + 'address, and give a working route to object. Not a compliance certification.',
    checks: Object.freeze([
      { key: 'legal_basis_recorded', required: true },
      { key: 'privacy_review_recorded', required: true },
      { key: 'contact_provenance_recorded', required: true },
      { key: 'objection_handling_available', required: true },
      { key: 'recipient_not_suppressed', required: true },
      { key: 'not_do_not_contact', required: true },
    ]),
  },
])

/**
 * The fallback for a market nobody has configured.
 *
 * It keeps the two hard boundaries and adds a check that cannot pass, so an
 * unconfigured market routes to a person instead of quietly passing. Silence
 * about a market is not evidence that outreach there is fine.
 */
const DEFAULT_MARKET = Object.freeze({
  countryCode: '',
  key: 'default-human-review',
  label: 'Unconfigured market — human review required',
  description:
    'No profile is configured for this market, so no market-specific checks could be run. The '
    + 'lead is held for human review rather than passed.',
  checks: Object.freeze([
    { key: 'market_profile_configured', required: true },
    { key: 'recipient_not_suppressed', required: true },
    { key: 'not_do_not_contact', required: true },
  ]),
})

/**
 * Expands a market's check references into the entries callers and the UI read.
 *
 * Throws on an unknown key rather than skipping it. A typo that silently
 * dropped a required check would be the exact failure this module exists to
 * prevent, and it would be invisible — the profile would simply have one fewer
 * check and pass more leads.
 *
 * @param {{ countryCode: string, key: string, label: string, description: string,
 *           checks: ReadonlyArray<{ key: string, required: boolean }> }} market
 * @returns {{ key: string, countryCode: string, label: string, description: string,
 *             checks: ReadonlyArray<{ key: string, label: string, required: boolean, description: string }> }}
 */
function buildProfile(market) {
  const checks = market.checks.map((entry) => {
    const definition = CHECK_DEFINITIONS[entry.key]
    if (!definition) throw new Error(`Unknown compliance check "${entry.key}" in profile ${market.key}`)
    return Object.freeze({
      key: entry.key,
      label: definition.label,
      required: entry.required,
      description: definition.description,
    })
  })

  return Object.freeze({
    key: market.key,
    countryCode: market.countryCode,
    label: market.label,
    description: market.description,
    checks: Object.freeze(checks),
  })
}

/** Configured profiles, keyed by ISO-3166-1 alpha-2 code. */
export const COUNTRY_PROFILES = Object.freeze(
  Object.fromEntries(MARKETS.map((market) => [market.countryCode, buildProfile(market)])),
)

/** The conservative fallback. Exported so tests and the UI can name it directly. */
export const DEFAULT_COUNTRY_PROFILE = buildProfile(DEFAULT_MARKET)

/**
 * The profile for a country code, never null.
 *
 * Returning the conservative fallback rather than null means no caller can
 * forget to handle "no profile" — the shape is always the same, and the
 * unconfigured case expresses itself as a check that fails rather than as an
 * absent object someone has to remember to test for.
 *
 * The fallback echoes back the requested code so the stored evaluation records
 * which market was actually being considered, not just that it was unknown.
 *
 * @param {unknown} countryCode ISO-3166-1 alpha-2, case-insensitive
 */
export function getCountryProfile(countryCode) {
  const normalized = String(countryCode ?? '').trim().toUpperCase()
  const isIso2 = /^[A-Z]{2}$/.test(normalized)

  if (isIso2 && COUNTRY_PROFILES[normalized]) return COUNTRY_PROFILES[normalized]

  return Object.freeze({ ...DEFAULT_COUNTRY_PROFILE, countryCode: isIso2 ? normalized : '' })
}
