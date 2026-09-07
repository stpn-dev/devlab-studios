import { getEnv } from './env'

// Cloudflare's documented always-passes test key. Public by design and safe
// to commit — it exists so a form is usable in local development without a
// real site key. https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

/**
 * Resolves the Turnstile site key for a page render.
 *
 * Extracted because three pages (contact, services, pickleball) had this same
 * four-line block copied verbatim; a change to the local-development rule had
 * to be made in three places or the pages would silently disagree.
 *
 * The branch is on the REQUEST hostname rather than a build-time flag because
 * these pages are server-rendered on Cloudflare, where one build serves both
 * preview and production. It is not a security boundary: token verification
 * happens server-side in `verifyTurnstileToken`, which fails closed whenever
 * the secret is configured, so a spoofed Host header buys nothing.
 */
export function resolveTurnstileSiteKey(requestUrl: string): string {
  const env = getEnv()
  const hostname = new URL(requestUrl).hostname
  const isLocalRequest = hostname === 'localhost' || hostname === '127.0.0.1'
  return isLocalRequest ? TURNSTILE_TEST_SITE_KEY : env.TURNSTILE_SITE_KEY || ''
}
