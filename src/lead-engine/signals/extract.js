/**
 * Deterministic signal extraction.
 *
 * Workers AI does NOT do basic website reading. Everything in this file is
 * HTML/DOM inspection, structured data, script-host fingerprinting and phrase
 * matching — code whose output is reproducible, explainable and free. The model
 * is reserved for the one judgement it is actually better at: whether the
 * observed facts add up to an opportunity worth a conversation.
 *
 * Each signal carries its own source URL and a short evidence excerpt, so a
 * human reviewing a lead can check any claim without the engine retaining the
 * page it came from.
 */

import { CRAWLER } from '../config/defaults.js'
import { canonicalDomain, normalizeEmail } from '../domain/domains.js'
import {
  AUDIENCE_TERMS,
  EMAIL_PATTERN,
  MANUAL_WORKFLOW_PHRASES,
  NON_CONTACT_EMAIL_PATTERNS,
  OPERATIONS_PHRASES,
  PHONE_PATTERN,
  PLATFORM_SIGNATURES,
  TECHNOLOGY_HOSTS,
} from './patterns.js'
import {
  excerptAround,
  externalHosts,
  extractContactLinks,
  inspectForms,
  metaDescription,
  pageTitle,
  parseJsonLd,
  visibleText,
} from './html.js'

/** Categories, matching the CHECK constraint on `lead_signals.category`. */
const CATEGORY = Object.freeze({
  website: 'website',
  contact: 'contact',
  scheduling: 'scheduling',
  chat: 'chat',
  crm_marketing: 'crm_marketing',
  operations: 'operations',
  manual_language: 'manual_language',
  complexity: 'complexity',
  technology: 'technology',
})

function signal(category, signalKey, extra = {}) {
  return {
    category,
    signalKey,
    detected: true,
    confidence: 1,
    ...extra,
    evidence: extra.evidence ? String(extra.evidence).slice(0, CRAWLER.evidenceExcerptLength) : null,
  }
}

/**
 * Whether an address is a plausible business contact.
 *
 * Runs before anything is stored, because the alternative is a lead that looks
 * contactable because a template's placeholder address was never replaced.
 *
 * @param {string} email
 * @param {string|null} companyDomain
 */
export function isPlausibleBusinessEmail(email, companyDomain = null) {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  if (NON_CONTACT_EMAIL_PATTERNS.some((pattern) => pattern.test(normalized))) return false

  // An address at the company's own domain is the strong case. An address
  // elsewhere (a Gmail account a small business genuinely publishes) is
  // accepted but the caller can see it did not match.
  if (companyDomain) {
    const addressDomain = normalized.slice(normalized.lastIndexOf('@') + 1)
    return Boolean(addressDomain)
  }

  return true
}

/** Which page role a URL looks like, for provenance on contact records. */
export function classifyPage(url) {
  let path
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    return 'company_other_page'
  }

  if (path === '/' || path === '') return 'company_homepage'
  if (/contact|get-in-touch|reach/.test(path)) return 'company_contact_page'
  if (/about/.test(path)) return 'company_about_page'
  if (/team|staff|people|our-people/.test(path)) return 'company_team_page'
  return 'company_other_page'
}

/**
 * Extracts every signal from a set of crawled pages.
 *
 * @param {{
 *   pages: Array<{ url: string, finalUrl?: string, html?: string, used?: boolean }>,
 *   websiteUrl: string,
 *   campaignConfig?: { targetIndustries?: string[], icpKeywords?: string[],
 *                      disqualifyingKeywords?: string[], serviceTerms?: string[],
 *                      metros?: string[] },
 *   company?: { countryCode?: string|null, city?: string|null, metro?: string|null,
 *               region?: string|null, sourceCount?: number }
 * }} input `company` carries what DISCOVERY already established — geography and
 *   how many independent sources reported this business. Those are real ICP and
 *   data-quality facts, but they are not on the page, so they arrive here rather
 *   than being scraped back out of one.
 * @returns {{
 *   signals: Array<object>,
 *   emails: Array<{ email: string, sourceUrl: string, sourceType: string, fromMailto: boolean }>,
 *   phones: string[],
 *   technologies: string[],
 *   pageSummaries: Array<{ url: string, title: string|null, description: string|null, textLength: number }>
 * }}
 */
export function extractSignals({ pages, websiteUrl, campaignConfig = {}, company = {} }) {
  const usable = (pages || []).filter((page) => page.used && page.html)
  const companyDomain = canonicalDomain(websiteUrl)

  const signals = []
  const emails = new Map()
  const phones = new Set()
  const technologies = new Set()
  const pageSummaries = []

  // Accumulated across pages, so "more than one manual workflow" is judged over
  // the whole site rather than per page — a business with a phone-only contact
  // page and a downloadable form on its services page has two, and that is the
  // observation worth scoring.
  const manualWorkflowKinds = new Set()
  const operationsFound = new Set()
  const audiencesFound = new Set()
  let anyForm = false
  let anyContactFormLike = false
  let structuredDataFound = false
  let combinedText = ''

  if (usable.length === 0) {
    return { signals, emails: [], phones: [], technologies: [], pageSummaries }
  }

  signals.push(
    signal(CATEGORY.website, 'ACTIVE_WEBSITE', {
      valueText: websiteUrl,
      sourceUrl: usable[0].finalUrl || usable[0].url,
    }),
  )

  if (companyDomain) {
    signals.push(
      signal(CATEGORY.website, 'RESOLVED_CANONICAL_DOMAIN', { valueText: companyDomain, sourceUrl: websiteUrl }),
    )
  }

  if (usable.length > 1) {
    signals.push(
      signal(CATEGORY.website, 'MULTIPLE_PAGES_ANALYZED', { valueText: String(usable.length), sourceUrl: websiteUrl }),
    )
  }

  for (const page of usable) {
    const url = page.finalUrl || page.url
    const html = page.html
    const text = visibleText(html)
    const lower = text.toLowerCase()
    combinedText += ` ${lower}`

    pageSummaries.push({
      url,
      title: pageTitle(html),
      description: metaDescription(html),
      textLength: text.length,
    })

    // --- Technology fingerprints ------------------------------------------
    const hosts = externalHosts(html, url)

    for (const [group, catalogue] of Object.entries(TECHNOLOGY_HOSTS)) {
      for (const [host, label] of Object.entries(catalogue)) {
        // A wildcard entry (app-*.marketingautomation.services) is matched by
        // suffix; everything else is an exact host match, because a substring
        // check would let `notcalendly.com.evil.net` register as Calendly.
        const matched = host.includes('*')
          ? [...hosts].some((candidate) => candidate.endsWith(host.split('*').pop()))
          : hosts.has(host)
        if (!matched) continue

        technologies.add(label)
        if (group === 'scheduling') {
          signals.push(signal(CATEGORY.scheduling, 'BOOKING_DETECTED', { valueText: label, sourceUrl: url }))
        } else if (group === 'chat') {
          signals.push(signal(CATEGORY.chat, 'CHAT_WIDGET_DETECTED', { valueText: label, sourceUrl: url }))
        } else if (group === 'crm_marketing') {
          signals.push(signal(CATEGORY.crm_marketing, 'CRM_DETECTED', { valueText: label, sourceUrl: url }))
        }
      }
    }

    for (const [label, pattern] of PLATFORM_SIGNATURES) {
      if (pattern.test(html)) {
        technologies.add(label)
        signals.push(signal(CATEGORY.technology, `PLATFORM_${label.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`, {
          valueText: label,
          sourceUrl: url,
        }))
      }
    }

    // --- Structured data ---------------------------------------------------
    const jsonLd = parseJsonLd(html)
    if (jsonLd.length > 0) {
      structuredDataFound = true
      for (const entity of jsonLd) {
        const contactEmail = entity.email || entity.contactPoint?.email
        if (typeof contactEmail === 'string' && isPlausibleBusinessEmail(contactEmail, companyDomain)) {
          const normalized = normalizeEmail(contactEmail)
          if (normalized && !emails.has(normalized)) {
            emails.set(normalized, { email: normalized, sourceUrl: url, sourceType: 'structured_data', fromMailto: false })
          }
        }
        const telephone = entity.telephone || entity.contactPoint?.telephone
        if (typeof telephone === 'string') phones.add(telephone.trim().slice(0, 40))
      }
    }

    // --- Contact links -----------------------------------------------------
    const links = extractContactLinks(html)
    for (const candidate of links.emails) {
      if (!isPlausibleBusinessEmail(candidate, companyDomain)) continue
      const normalized = normalizeEmail(candidate)
      if (!normalized) continue
      // A mailto link beats a prose match, so it overwrites a weaker earlier
      // sighting of the same address.
      const existing = emails.get(normalized)
      if (!existing || !existing.fromMailto) {
        emails.set(normalized, { email: normalized, sourceUrl: url, sourceType: classifyPage(url), fromMailto: true })
      }
    }
    for (const phone of links.phones) phones.add(phone.replace(/[^\d+]/g, '').slice(0, 20))

    // --- Addresses and phones in prose ------------------------------------
    // Reset lastIndex before each use. These are module-level /g regexes shared
    // across pages, and `matchAll` copies lastIndex from the source regex — so a
    // stateful regex reused without resetting silently skips matches on the
    // second page onward.
    EMAIL_PATTERN.lastIndex = 0
    for (const match of text.matchAll(EMAIL_PATTERN)) {
      const candidate = match[0]
      if (!isPlausibleBusinessEmail(candidate, companyDomain)) continue
      const normalized = normalizeEmail(candidate)
      if (normalized && !emails.has(normalized)) {
        emails.set(normalized, { email: normalized, sourceUrl: url, sourceType: classifyPage(url), fromMailto: false })
      }
    }

    PHONE_PATTERN.lastIndex = 0
    for (const match of text.matchAll(PHONE_PATTERN)) phones.add(match[0].trim().slice(0, 30))

    // --- Forms -------------------------------------------------------------
    const forms = inspectForms(html)
    if (forms.hasForm) {
      anyForm = true
      // A textarea, or a form on a page that looks like a contact page, is what
      // distinguishes a contact form from a search box or newsletter signup.
      if (forms.hasTextarea || classifyPage(url) === 'company_contact_page') anyContactFormLike = true
    }

    // --- Manual workflow language -----------------------------------------
    for (const [kind, phrases] of Object.entries(MANUAL_WORKFLOW_PHRASES)) {
      const hit = phrases.find((phrase) => lower.includes(phrase))
      if (!hit) continue
      manualWorkflowKinds.add(kind)
      signals.push(
        signal(CATEGORY.manual_language, `MANUAL_${kind.toUpperCase()}`, {
          valueText: hit,
          sourceUrl: url,
          evidence: excerptAround(text, hit, CRAWLER.evidenceExcerptLength),
        }),
      )
    }

    // --- Operational surfaces ---------------------------------------------
    for (const [key, phrases] of Object.entries(OPERATIONS_PHRASES)) {
      const hit = phrases.find((phrase) => lower.includes(phrase))
      if (!hit) continue
      operationsFound.add(key)
      signals.push(
        signal(CATEGORY.operations, key, {
          valueText: hit,
          sourceUrl: url,
          evidence: excerptAround(text, hit, CRAWLER.evidenceExcerptLength),
        }),
      )
    }

    // A linked PDF on a page that also talks about forms is a PDF workflow.
    // The conjunction matters: a linked PDF on its own is usually a brochure.
    if (/href\s*=\s*["'][^"']*\.pdf["']/i.test(html) && /form|application|agreement|packet/i.test(lower)) {
      signals.push(
        signal(CATEGORY.operations, 'PDF_WORKFLOW', {
          valueText: 'linked PDF form',
          sourceUrl: url,
          evidence: excerptAround(text, 'form', CRAWLER.evidenceExcerptLength),
        }),
      )
    }

    if (/href\s*=\s*["'][^"']*\.(?:pdf|docx?)["'][^>]*>[^<]{0,80}(?:download|form|application)/i.test(html)) {
      signals.push(signal(CATEGORY.operations, 'DOWNLOADABLE_FORM', { sourceUrl: url }))
    }

    for (const term of AUDIENCE_TERMS) {
      if (new RegExp(`\\b${term}\\b`).test(lower)) audiencesFound.add(term)
    }
  }

  // --- Site-wide conclusions ------------------------------------------------

  if (anyContactFormLike) {
    signals.push(signal(CATEGORY.contact, 'CONTACT_FORM', { sourceUrl: websiteUrl }))
  } else if (anyForm) {
    signals.push(signal(CATEGORY.contact, 'FORM_PRESENT_NOT_CONTACT', { sourceUrl: websiteUrl }))
  }

  if (usable.some((page) => classifyPage(page.finalUrl || page.url) === 'company_contact_page')) {
    signals.push(signal(CATEGORY.contact, 'CONTACT_PAGE_REACHABLE', { sourceUrl: websiteUrl }))
  }

  if (emails.size > 0) {
    const first = [...emails.values()][0]
    signals.push(
      signal(CATEGORY.contact, 'PUBLIC_BUSINESS_EMAIL', { valueText: first.email, sourceUrl: first.sourceUrl }),
    )
  }

  if (phones.size > 0) {
    signals.push(signal(CATEGORY.contact, 'PUBLIC_PHONE', { valueText: [...phones][0], sourceUrl: websiteUrl }))
  }

  if (structuredDataFound) {
    signals.push(signal(CATEGORY.website, 'STRUCTURED_DATA_PRESENT', { sourceUrl: websiteUrl }))
  }

  if (manualWorkflowKinds.size > 0) {
    signals.push(
      signal(CATEGORY.manual_language, 'MANUAL_WORKFLOW_LANGUAGE', {
        valueText: [...manualWorkflowKinds].join(', '),
        sourceUrl: websiteUrl,
      }),
    )
  }
  if (manualWorkflowKinds.size > 1) {
    signals.push(
      signal(CATEGORY.manual_language, 'MULTIPLE_MANUAL_WORKFLOWS', {
        valueText: String(manualWorkflowKinds.size),
        sourceUrl: websiteUrl,
      }),
    )
  }

  if (['CUSTOMER_PORTAL', 'OWNER_PORTAL', 'TENANT_PORTAL'].some((key) => operationsFound.has(key))) {
    signals.push(signal(CATEGORY.operations, 'CLIENT_PORTAL', { sourceUrl: websiteUrl }))
  }

  // --- Absence signals ------------------------------------------------------
  // Absence is only meaningful if we actually looked. These are emitted from
  // the site-wide view, after every page has been scanned, and never from a
  // single page — "no booking found on the about page" says nothing.
  const hasBooking = signals.some((entry) => entry.signalKey === 'BOOKING_DETECTED')
  if (!hasBooking) {
    signals.push(signal(CATEGORY.scheduling, 'NO_VISIBLE_SCHEDULING', { sourceUrl: websiteUrl }))
  }

  const hasChat = signals.some((entry) => entry.signalKey === 'CHAT_WIDGET_DETECTED')
  if (!hasChat) {
    signals.push(signal(CATEGORY.chat, 'NO_VISIBLE_CHAT', { sourceUrl: websiteUrl }))
  }

  // --- Complexity -----------------------------------------------------------
  if (audiencesFound.size >= 2) {
    signals.push(
      signal(CATEGORY.complexity, 'MULTIPLE_AUDIENCES', {
        valueText: [...audiencesFound].slice(0, 8).join(', '),
        sourceUrl: websiteUrl,
      }),
    )
  }

  const serviceTerms = campaignConfig.serviceTerms || []
  const matchedServices = serviceTerms.filter((term) => combinedText.includes(String(term).toLowerCase()))
  if (matchedServices.length >= 2) {
    signals.push(
      signal(CATEGORY.complexity, 'MULTIPLE_SERVICES', {
        valueText: matchedServices.slice(0, 8).join(', '),
        sourceUrl: websiteUrl,
      }),
    )
  }

  if (/\b(?:locations|offices|branches)\b/.test(combinedText) && /\b(?:our (?:locations|offices)|multiple locations)\b/.test(combinedText)) {
    signals.push(signal(CATEGORY.complexity, 'MULTIPLE_LOCATIONS', { sourceUrl: websiteUrl }))
  }

  // --- Campaign vocabulary --------------------------------------------------
  const targetIndustries = campaignConfig.targetIndustries || []
  const matchedIndustry = targetIndustries.find((term) => combinedText.includes(String(term).toLowerCase()))
  if (matchedIndustry) {
    signals.push(
      signal(CATEGORY.website, 'TARGET_INDUSTRY', {
        valueText: matchedIndustry,
        sourceUrl: websiteUrl,
        evidence: excerptAround(combinedText, matchedIndustry, CRAWLER.evidenceExcerptLength),
      }),
    )
  }

  // --- Geography and corroboration -----------------------------------------
  // These come from the discovery record rather than the page: a business
  // rarely states its own country in machine-readable form, and "two sources
  // agreed" is not something any single page can tell us. They carry weights
  // and operator-facing labels, so without this block those points could never
  // be earned and ICP fit would be industry-only.
  const campaignCountry = String(campaignConfig.countryCode || '').toUpperCase()
  const companyCountry = String(company.countryCode || '').toUpperCase()
  if (campaignCountry && companyCountry && campaignCountry === companyCountry) {
    signals.push(signal(CATEGORY.website, 'TARGET_COUNTRY', { valueText: companyCountry, sourceUrl: websiteUrl }))
  }

  const targetMetros = (campaignConfig.metros || []).map((metro) => String(metro).toLowerCase())
  const companyPlaces = [company.metro, company.city, company.region]
    .filter(Boolean)
    .map((place) => String(place).toLowerCase())
  const matchedMetro = targetMetros.find((metro) => companyPlaces.some((place) => place.includes(metro)))
  if (matchedMetro) {
    signals.push(signal(CATEGORY.website, 'TARGET_METRO', { valueText: matchedMetro, sourceUrl: websiteUrl }))
  }

  // `sourceCount` is set by dedupeCandidates when two independent adapters
  // returned the same canonical domain. Two sources agreeing is the strongest
  // data-quality signal available before anything is crawled.
  if (Number(company.sourceCount) >= 2) {
    signals.push(
      signal(CATEGORY.website, 'CORROBORATED_BY_TWO_SOURCES', {
        valueText: String(company.sourceCount),
        sourceUrl: websiteUrl,
      }),
    )
  }

  const disqualifying = campaignConfig.disqualifyingKeywords || []
  const matchedDisqualifier = disqualifying.find((term) => combinedText.includes(String(term).toLowerCase()))
  if (matchedDisqualifier) {
    signals.push(
      signal(CATEGORY.website, 'DISQUALIFYING_KEYWORD', {
        valueText: matchedDisqualifier,
        sourceUrl: websiteUrl,
        evidence: excerptAround(combinedText, matchedDisqualifier, CRAWLER.evidenceExcerptLength),
      }),
    )
  }

  for (const technology of technologies) {
    signals.push(signal(CATEGORY.technology, `TECH_${technology.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`, {
      valueText: technology,
      sourceUrl: websiteUrl,
    }))
  }

  return {
    signals,
    emails: [...emails.values()],
    phones: [...phones].slice(0, 5),
    technologies: [...technologies],
    pageSummaries,
  }
}
