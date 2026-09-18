/**
 * Crawls up to four pages of one public business website.
 *
 * The page budget is the defining constraint. Four pages is enough for
 * homepage + contact + services + about, which is where every signal this
 * engine needs actually lives — and it is few enough that crawling a hundred
 * businesses is a few hundred requests rather than a few thousand. Link
 * discovery therefore is not a breadth-first crawl: it scores the links found
 * on the homepage against a priority list and takes the best three.
 *
 * Nothing here authenticates, bypasses a CAPTCHA or Turnstile, rotates an
 * address, or retries past a block. A site that refuses us is recorded as
 * refused and left alone.
 */

import { CRAWL_PATH_PRIORITY, CRAWLER } from '../config/defaults.js'
import { canonicalizeUrl, isSameSite, parseWebsite } from '../domain/domains.js'
import { fetchPage } from './fetchPage.js'
import { fetchRobots } from './robots.js'

/**
 * Extracts same-site links from HTML.
 *
 * A regex rather than a DOM parse. Workers has HTMLRewriter but it is a
 * streaming transformer rather than a queryable DOM, and there is no DOMParser
 * in the runtime at all — so a full parser would mean bundling one. For the
 * narrow job of "find href values", a regex over the raw HTML is both
 * sufficient and testable in plain Node, which is what the test suite runs in.
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Array<{ url: string, text: string }>}
 */
export function extractLinks(html, baseUrl) {
  const links = []
  const seen = new Set()
  // Bounded scan: the href pattern is linear, but the input is untrusted, so
  // the number of matches considered is capped.
  const pattern = /<a\b[^>]*?href\s*=\s*["']([^"']{1,500})["'][^>]*>([\s\S]{0,200}?)<\/a>/gi

  let match
  let considered = 0
  while ((match = pattern.exec(html)) !== null && considered < 500) {
    considered += 1
    const [, href, rawText] = match

    if (/^(?:#|mailto:|tel:|javascript:|data:)/i.test(href.trim())) continue

    let absolute
    try {
      absolute = new URL(href, baseUrl).toString()
    } catch {
      continue
    }

    const canonical = canonicalizeUrl(absolute)
    if (!canonical || seen.has(canonical)) continue
    if (!isSameSite(baseUrl, canonical)) continue

    seen.add(canonical)
    links.push({
      url: canonical,
      text: rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120),
    })
  }

  return links
}

/**
 * Scores a discovered link against the priority path list.
 *
 * Both the path and the visible link text are considered: plenty of sites use
 * `/get-in-touch` rather than `/contact`, and the anchor text is what tells us
 * it is the contact page. A lower score sorts first.
 *
 * @param {{ url: string, text: string }} link
 * @param {readonly string[]} priority
 * @returns {number} Infinity when the link is not worth a page of budget
 */
export function scoreLink(link, priority = CRAWL_PATH_PRIORITY) {
  let path
  try {
    path = new URL(link.url).pathname.toLowerCase().replace(/\/+$/, '') || '/'
  } catch {
    return Infinity
  }

  const index = priority.findIndex((candidate) => {
    const normalized = candidate.toLowerCase().replace(/\/+$/, '') || '/'
    return path === normalized || path.startsWith(`${normalized}/`)
  })
  if (index !== -1) return index

  // Fall back to the link's own words. Offset past the priority list so an
  // explicit path always beats a text match.
  const haystack = `${path} ${link.text}`.toLowerCase()
  const TEXT_HINTS = [
    'contact', 'get in touch', 'reach us', 'services', 'what we do', 'about',
    'owners', 'team', 'book', 'schedule', 'quote', 'pricing', 'locations',
    'tenants', 'residents', 'portal', 'apply', 'application',
  ]
  const hintIndex = TEXT_HINTS.findIndex((hint) => haystack.includes(hint))
  return hintIndex === -1 ? Infinity : priority.length + hintIndex
}

/**
 * Whether a fetched page looks like it rendered nothing server-side.
 *
 * The trigger for considering Browser Run. Measured on visible text after
 * stripping script and style, because a client-rendered app typically serves a
 * large HTML document containing almost no words.
 *
 * @param {string} html
 * @param {number} [threshold]
 */
export function looksClientRendered(html, threshold = CRAWLER.clientRenderedTextThreshold) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return text.length < threshold
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Crawls a site.
 *
 * @param {string} websiteUrl
 * @param {{
 *   fetchImpl?: typeof fetch, limits?: object, userAgent?: string,
 *   onBudget?: () => Promise<boolean>, signal?: AbortSignal, sleepImpl?: (ms: number) => Promise<void>
 * }} [options] `onBudget` is called before each page fetch and returning false
 *   stops the crawl — that is how the daily page budget reaches this loop
 *   without this module having to know about D1.
 * @returns {Promise<{
 *   status: 'completed'|'failed'|'skipped', skipReason: string|null, errorMessage: string|null,
 *   robotsAllowed: boolean|null, pages: Array<object>, pagesAttempted: number,
 *   pagesFetched: number, bytesFetched: number, clientRendered: boolean
 * }>}
 */
export async function crawlSite(websiteUrl, options = {}) {
  const limits = { ...CRAWLER, ...(options.limits || {}) }
  const userAgent = options.userAgent || limits.userAgent
  const doSleep = options.sleepImpl || sleep

  const result = {
    status: 'completed',
    skipReason: null,
    errorMessage: null,
    robotsAllowed: null,
    pages: [],
    pagesAttempted: 0,
    pagesFetched: 0,
    bytesFetched: 0,
    clientRendered: false,
  }

  const parsed = parseWebsite(websiteUrl)
  if (!parsed) {
    result.status = 'skipped'
    result.skipReason = 'unparseable_website'
    return result
  }

  const origin = parsed.origin
  const robots = await fetchRobots(origin, { fetchImpl: options.fetchImpl, userAgent, timeoutMs: limits.requestTimeoutMs })

  if (!robots.allowed('/')) {
    // Recorded as a skip WITH the reason, never as a silent nothing-happened.
    result.status = 'skipped'
    result.skipReason = `robots_disallowed:${robots.status}`
    result.robotsAllowed = false
    return result
  }
  result.robotsAllowed = true

  // A site's own Crawl-delay overrides our default, but only upward — we do not
  // crawl faster than our own floor because a site said we could.
  const delayMs = Math.max(limits.perDomainDelayMs, robots.crawlDelayMs ?? 0)

  /** @type {string[]} */
  const queue = [canonicalizeUrl(origin) || `${origin}/`]
  const visited = new Set()
  let homepageProcessed = false

  while (queue.length > 0 && result.pagesFetched < limits.maxPagesPerSite) {
    if (options.signal?.aborted) {
      result.status = 'failed'
      result.errorMessage = 'cancelled'
      return result
    }

    const url = queue.shift()
    const canonical = canonicalizeUrl(url)
    if (!canonical || visited.has(canonical)) continue
    visited.add(canonical)

    const path = (() => {
      try {
        return new URL(canonical).pathname
      } catch {
        return '/'
      }
    })()

    if (!robots.allowed(path)) {
      result.pages.push({ url: canonical, used: false, reason: 'robots_disallowed' })
      continue
    }

    // Budget is consumed per page ATTEMPT, before the request. Checking after
    // would let a run overshoot by its concurrency.
    if (options.onBudget && !(await options.onBudget())) {
      result.pages.push({ url: canonical, used: false, reason: 'budget_exhausted' })
      break
    }

    result.pagesAttempted += 1
    const page = await fetchPage(canonical, {
      fetchImpl: options.fetchImpl,
      limits,
      userAgent,
      signal: options.signal,
    })

    result.pages.push({
      url: canonical,
      finalUrl: page.finalUrl,
      status: page.status,
      contentType: page.contentType,
      bytes: page.bytes,
      used: page.ok,
      reason: page.reason,
    })

    if (!page.ok) {
      // The homepage failing is the crawl failing; a secondary page failing is
      // just one fewer page. A site whose homepage does not answer has nothing
      // for the engine to read.
      if (!homepageProcessed) {
        result.status = 'failed'
        result.errorMessage = page.reason || 'homepage_unreachable'
        return result
      }
      await doSleep(delayMs)
      continue
    }

    result.pagesFetched += 1
    result.bytesFetched += page.bytes
    result.pages[result.pages.length - 1].html = page.html

    if (!homepageProcessed) {
      homepageProcessed = true
      result.clientRendered = looksClientRendered(page.html, limits.clientRenderedTextThreshold)

      const candidates = extractLinks(page.html, page.finalUrl || canonical)
        .map((link) => ({ link, score: scoreLink(link, CRAWL_PATH_PRIORITY) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => a.score - b.score)

      for (const entry of candidates) {
        if (queue.length >= limits.maxPagesPerSite - 1) break
        if (!visited.has(entry.link.url)) queue.push(entry.link.url)
      }
    }

    if (queue.length > 0) await doSleep(delayMs)
  }

  if (result.pagesFetched === 0 && result.status === 'completed') {
    result.status = 'failed'
    result.errorMessage = result.errorMessage || 'no_pages_fetched'
  }

  return result
}
