/**
 * Browser rendering fallback.
 *
 * Used ONLY when all three hold: a normal HTTP fetch produced no meaningful
 * page content, the site is clearly client-rendered, and access is permitted
 * (robots.txt already said yes — this is the same page, fetched differently,
 * not a way around a refusal).
 *
 * Implemented against Cloudflare's Browser Rendering REST `/content` endpoint
 * rather than the Workers binding. The binding requires `@cloudflare/puppeteer`,
 * which is a substantial dependency to add to a Worker that serves the public
 * site, for a path that runs on a small minority of leads. The REST endpoint
 * needs an account id and a scoped API token and nothing else — and when they
 * are absent this module is completely inert, which is the state it ships in.
 *
 * Every invocation is counted against the daily `browser_runs` budget by the
 * caller before it gets here.
 */

import { CRAWLER } from '../config/defaults.js'
import { assertSafeUrl, UnsafeUrlError } from './ssrf.js'

const BROWSER_RENDER_TIMEOUT_MS = 30_000

/**
 * Whether the fallback is configured at all.
 *
 * @param {Record<string, unknown>} env
 */
export function isBrowserRunConfigured(env) {
  return Boolean(env?.CLOUDFLARE_ACCOUNT_ID && env?.BROWSER_RENDERING_API_TOKEN)
}

/**
 * Whether a crawl outcome justifies spending a browser run.
 *
 * All three conditions, explicitly. Written as a function returning a reason
 * so a skipped fallback is explainable on the lead detail screen rather than
 * being an invisible non-event.
 *
 * @param {{ status: string, clientRendered: boolean, robotsAllowed: boolean|null }} crawlResult
 * @returns {{ eligible: boolean, reason: string }}
 */
export function shouldUseBrowserRun(crawlResult) {
  if (crawlResult.robotsAllowed === false) {
    return { eligible: false, reason: 'robots_disallowed' }
  }
  if (!crawlResult.clientRendered) {
    return { eligible: false, reason: 'server_rendered_content_available' }
  }
  if (crawlResult.status === 'skipped') {
    return { eligible: false, reason: 'crawl_skipped' }
  }
  return { eligible: true, reason: 'client_rendered_empty_page' }
}

/**
 * Renders one page and returns its HTML.
 *
 * Returns an outcome rather than throwing, for the same reason `fetchPage`
 * does: a rendering failure is an ordinary crawl outcome.
 *
 * @param {Record<string, unknown>} env
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, html: string, bytes: number, reason: string|null }>}
 */
export async function renderPage(env, url, options = {}) {
  const outcome = { ok: false, html: '', bytes: 0, reason: null }

  if (!isBrowserRunConfigured(env)) {
    outcome.reason = 'browser_run_not_configured'
    return outcome
  }

  // The same SSRF check as the normal path. A different fetch mechanism is not
  // a reason to skip it — if anything a headless browser is a more capable
  // request engine to have pointed at an internal address.
  let safeUrl
  try {
    safeUrl = assertSafeUrl(url).toString()
  } catch (error) {
    outcome.reason = error instanceof UnsafeUrlError ? error.reason : 'invalid_url'
    return outcome
  }

  const fetchImpl = options.fetchImpl || fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? BROWSER_RENDER_TIMEOUT_MS)

  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/content`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.BROWSER_RENDERING_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: safeUrl,
          // The same identity the HTTP crawler uses. A fallback that presents
          // itself as a real browser would be misrepresenting who is asking.
          userAgent: CRAWLER.userAgent,
          gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 },
          rejectResourceTypes: ['image', 'media', 'font'],
        }),
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      outcome.reason = `browser_render_http_${response.status}`
      return outcome
    }

    const body = await response.json().catch(() => null)
    const html = typeof body?.result === 'string' ? body.result : ''

    if (!html) {
      outcome.reason = 'browser_render_empty'
      return outcome
    }

    const bounded = html.slice(0, CRAWLER.maxResponseBytes)
    outcome.ok = true
    outcome.html = bounded
    outcome.bytes = bounded.length
    return outcome
  } catch (error) {
    outcome.reason = controller.signal.aborted
      ? 'browser_render_timeout'
      : `browser_render_error:${error instanceof Error ? error.name : 'unknown'}`
    return outcome
  } finally {
    clearTimeout(timer)
  }
}
