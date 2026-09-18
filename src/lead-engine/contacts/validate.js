/**
 * Inexpensive contact validation.
 *
 * Three checks, in increasing cost: syntax, domain shape, and whether the
 * domain publishes MX records. No paid validator, no SMTP probing — the latter
 * is both unreliable from a Worker and rude to the receiving server.
 *
 * MX PRESENCE IS NOT MAILBOX VERIFICATION. A domain can publish MX records and
 * still reject every address at it. The column is `mx_present`, the UI label
 * says "domain accepts mail", and nothing in this system calls an address
 * "verified" — because we have not verified it, and a label claiming otherwise
 * would make a human trust a bounce-prone address.
 */

import { CONTACTS } from '../config/defaults.js'
import { emailDomain, normalizeEmail } from '../domain/domains.js'

/**
 * Syntax check.
 *
 * Deliberately stricter than RFC 5321. The RFC permits quoted local parts,
 * comments and IP-literal domains; none of those appear on a business contact
 * page, and accepting them only widens what can be stored.
 *
 * @param {unknown} value
 * @returns {{ valid: boolean, reason?: string, email?: string }}
 */
export function checkSyntax(value) {
  const email = normalizeEmail(value)
  if (!email) return { valid: false, reason: 'unparseable' }

  const [localPart, domain] = [email.slice(0, email.lastIndexOf('@')), email.slice(email.lastIndexOf('@') + 1)]

  if (localPart.length === 0 || localPart.length > 64) return { valid: false, reason: 'local_part_length' }
  if (domain.length === 0 || domain.length > 253) return { valid: false, reason: 'domain_length' }
  if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?$/.test(localPart)) return { valid: false, reason: 'local_part_characters' }
  if (localPart.includes('..')) return { valid: false, reason: 'consecutive_dots' }

  const labels = domain.split('.')
  if (labels.length < 2) return { valid: false, reason: 'domain_not_qualified' }
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    return { valid: false, reason: 'domain_labels' }
  }
  // A TLD of digits is an IP-literal-ish shape, not a domain.
  if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return { valid: false, reason: 'tld' }

  return { valid: true, email }
}

/**
 * Whether the address's domain is the company's own.
 *
 * Not a validity check — a small business genuinely publishing a Gmail address
 * is contactable — but it is the strongest available signal that the address
 * belongs to the business we think it does.
 *
 * @param {string} email
 * @param {string|null} companyDomain
 */
export function domainMatchesCompany(email, companyDomain) {
  if (!companyDomain) return false
  const domain = emailDomain(email)
  if (!domain) return false
  // A subdomain of the company domain counts: mail@mail.example.com is still
  // the company.
  return domain === companyDomain || domain.endsWith(`.${companyDomain}`)
}

/**
 * Looks up MX records over DNS-over-HTTPS.
 *
 * DoH rather than a DNS library: Workers has no UDP socket and therefore no
 * conventional resolver. Cloudflare's own resolver is used because it is
 * already the network this Worker runs on.
 *
 * Returns `null` for "could not determine" rather than `false`, and the
 * distinction is the point: a resolver timeout must not be recorded as "this
 * domain does not accept mail", which would take a perfectly good lead out of
 * the pipeline.
 *
 * @param {string} domain
 * @param {{ fetchImpl?: typeof fetch, endpoint?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ present: boolean|null, reason: string, records: string[] }>}
 */
export async function lookupMx(domain, options = {}) {
  if (!domain) return { present: null, reason: 'no_domain', records: [] }

  const fetchImpl = options.fetchImpl || fetch
  const endpoint = options.endpoint || CONTACTS.dohEndpoint
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? CONTACTS.dohTimeoutMs)

  try {
    const response = await fetchImpl(`${endpoint}?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    })

    if (!response.ok) return { present: null, reason: `resolver_http_${response.status}`, records: [] }

    const body = await response.json().catch(() => null)
    if (!body) return { present: null, reason: 'resolver_unparseable', records: [] }

    // NXDOMAIN (status 3) is a genuine answer: the domain does not exist, so it
    // cannot accept mail. Any other non-zero status is a resolver problem and
    // stays indeterminate.
    if (body.Status === 3) return { present: false, reason: 'nxdomain', records: [] }
    if (body.Status !== 0) return { present: null, reason: `resolver_status_${body.Status}`, records: [] }

    // Type 15 is MX. Filtering by type matters because the Answer array can
    // contain CNAME records taken on the way to the MX.
    const records = (body.Answer || [])
      .filter((answer) => answer.type === 15 && typeof answer.data === 'string')
      .map((answer) => answer.data.trim())

    if (records.length === 0) return { present: false, reason: 'no_mx_records', records: [] }

    // A single "." target is the RFC 7505 null MX: the domain explicitly
    // announces that it accepts no mail. Reading that as "has MX records"
    // would be exactly backwards.
    if (records.length === 1 && /(?:^|\s)\.$/.test(records[0])) {
      return { present: false, reason: 'null_mx', records }
    }

    return { present: true, reason: 'mx_records_found', records: records.slice(0, 5) }
  } catch {
    return { present: null, reason: controller.signal.aborted ? 'resolver_timeout' : 'resolver_error', records: [] }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The full validation for one contact.
 *
 * @param {string} email
 * @param {{ companyDomain?: string|null, fetchImpl?: typeof fetch, checkMx?: boolean }} [options]
 * @returns {Promise<{
 *   email: string|null, syntaxValid: boolean, syntaxReason: string|null,
 *   domainMatchesCompany: boolean, mxPresent: boolean|null, mxReason: string|null
 * }>}
 */
export async function validateContact(email, options = {}) {
  const syntax = checkSyntax(email)

  const result = {
    email: syntax.email ?? null,
    syntaxValid: syntax.valid,
    syntaxReason: syntax.valid ? null : syntax.reason,
    domainMatchesCompany: false,
    mxPresent: null,
    mxReason: null,
  }

  if (!syntax.valid) return result

  result.domainMatchesCompany = domainMatchesCompany(syntax.email, options.companyDomain ?? null)

  // The MX lookup is the only network call here, so it is opt-out: batch
  // re-validation of existing contacts does not need to re-resolve every
  // domain.
  if (options.checkMx !== false) {
    const mx = await lookupMx(emailDomain(syntax.email), { fetchImpl: options.fetchImpl })
    result.mxPresent = mx.present
    result.mxReason = mx.reason
  }

  return result
}

/**
 * The operator-facing description of an MX result.
 *
 * Centralized so no screen can independently decide to call this "verified".
 *
 * @param {boolean|null} mxPresent
 */
export function describeMxState(mxPresent) {
  if (mxPresent === true) return 'Domain accepts mail (MX records found — not a mailbox check)'
  if (mxPresent === false) return 'Domain publishes no MX records'
  return 'Not checked'
}
