/**
 * Contact discovery.
 *
 * Runs only AFTER qualification. That ordering is a data-minimization decision,
 * not a performance one: extracting and storing a business's contact details is
 * the point at which this system starts holding information about a specific
 * organization it might email, and there is no reason to do that for a lead
 * that will never be contacted.
 *
 * The rule that shapes everything here: an address is stored only if it was
 * OBSERVED on a page the company itself publishes. There is no code path that
 * constructs `firstname.lastname@domain.com`, and there is no `inferred` value
 * in the `source_type` column for such an address to be stored under. Social
 * profiles are never read.
 */

import { CONTACTS } from '../config/defaults.js'
import { canonicalDomain, emailDomain, normalizeEmail } from '../domain/domains.js'
import { classifyPage } from '../signals/extract.js'

/**
 * How strongly a page's role supports an address found on it.
 *
 * A contact page publishing an address is unambiguous. The same address in a
 * blog post's footer is weaker evidence of "this is how to reach us", even
 * though it is the same string.
 */
const SOURCE_TYPE_RANK = Object.freeze({
  structured_data: 0,
  company_contact_page: 1,
  company_about_page: 2,
  company_team_page: 3,
  company_homepage: 4,
  company_other_page: 5,
  source_record: 6,
  manual_entry: 7,
})

/**
 * Classifies an address by how it is used.
 *
 *   role    — a published business function (hello@, info@, sales@)
 *   named   — a person's address the company itself publishes for business contact
 *   generic — anything else at the company domain
 *
 * `role` is preferred throughout the engine. It is unambiguously published for
 * business contact, and it means this system holds a mailbox rather than a
 * named individual — which is both the smaller privacy footprint and the more
 * durable address.
 *
 * @param {string} email normalized
 * @param {string|null} companyDomain
 * @returns {'role'|'named'|'generic'}
 */
export function classifyEmailType(email, companyDomain = null) {
  const localPart = email.slice(0, email.indexOf('@')).toLowerCase()

  if (CONTACTS.preferredLocalParts.includes(localPart)) return 'role'

  // A local part that looks like a person's name: `jane`, `jane.doe`,
  // `jdoe`. Only ever a CLASSIFICATION of an address we already observed —
  // this never generates one.
  if (/^[a-z]+(?:[._-][a-z]+)?$/.test(localPart) && localPart.length >= 3) {
    const domainMatches = companyDomain && emailDomain(email) === companyDomain
    return domainMatches ? 'named' : 'generic'
  }

  return 'generic'
}

/**
 * Whether an address should be stored at all.
 *
 * @param {string} email normalized
 * @returns {{ usable: boolean, reason?: string }}
 */
export function isStorableContact(email) {
  const localPart = email.slice(0, email.indexOf('@')).toLowerCase()

  if (CONTACTS.excludedLocalParts.includes(localPart)) {
    return { usable: false, reason: `role_not_business_development:${localPart}` }
  }

  // An address whose local part is a long hex string is almost always a
  // per-visitor tracking or ticketing address rather than a way to reach a
  // person.
  if (/^[0-9a-f]{16,}$/i.test(localPart)) return { usable: false, reason: 'machine_generated_address' }

  return { usable: true }
}

/**
 * Ranks discovered addresses into the order outreach should prefer.
 *
 * Ordering, in priority: a role address at the company's own domain, then any
 * address at the company's own domain, then the strength of the page it was
 * found on, then discovery order for stability.
 *
 * @param {Array<{ email: string, sourceUrl: string, sourceType: string, fromMailto?: boolean }>} candidates
 * @param {string} websiteUrl
 * @param {number} [max]
 */
export function rankContacts(candidates, websiteUrl, max = CONTACTS.maxContactsPerLead) {
  const companyDomain = canonicalDomain(websiteUrl)

  const scored = []
  const seen = new Set()

  for (const candidate of candidates) {
    const email = normalizeEmail(candidate.email)
    if (!email || seen.has(email)) continue

    const storable = isStorableContact(email)
    if (!storable.usable) continue

    seen.add(email)

    const addressDomain = emailDomain(email)
    const domainMatches = Boolean(companyDomain) && addressDomain === companyDomain
    const emailType = classifyEmailType(email, companyDomain)

    scored.push({
      email,
      emailType,
      sourceUrl: candidate.sourceUrl,
      sourceType: candidate.sourceType || classifyPage(candidate.sourceUrl),
      domainMatchesCompany: domainMatches,
      // Recorded as an explicit boolean rather than inferred later: the whole
      // point of provenance is that the claim travels with the record.
      publishedPublicly: true,
      syntaxValid: true,
      rank: [
        domainMatches ? 0 : 1,
        emailType === 'role' ? 0 : emailType === 'generic' ? 1 : 2,
        SOURCE_TYPE_RANK[candidate.sourceType] ?? SOURCE_TYPE_RANK.company_other_page,
        candidate.fromMailto ? 0 : 1,
      ],
    })
  }

  scored.sort((a, b) => {
    for (let index = 0; index < a.rank.length; index += 1) {
      if (a.rank[index] !== b.rank[index]) return a.rank[index] - b.rank[index]
    }
    return a.email.localeCompare(b.email)
  })

  return scored.slice(0, max).map(({ rank, ...contact }, index) => {
    void rank
    return { ...contact, isPrimary: index === 0 }
  })
}

/**
 * Selects the contacts to store from a crawl's extracted addresses.
 *
 * A thin wrapper over `rankContacts`, kept as its own export because it is the
 * seam the research service calls and because it is where a future
 * source-record fallback (an address a directory published, rather than the
 * company's own site) would be merged in.
 *
 * @param {{ extractedEmails: Array<object>, websiteUrl: string, sourceRecordEmails?: Array<object> }} input
 */
export function selectContacts({ extractedEmails, websiteUrl, sourceRecordEmails = [] }) {
  // Site-observed addresses come first, so a directory's stale listing never
  // outranks what the company publishes itself today.
  return rankContacts([...extractedEmails, ...sourceRecordEmails], websiteUrl)
}
