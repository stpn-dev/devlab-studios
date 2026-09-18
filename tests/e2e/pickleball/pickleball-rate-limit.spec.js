import { test, expect } from '@playwright/test'

// The previous limiters were module-scope Maps. On Workers each isolate has
// its own memory, so they counted almost nothing: measured against
// production, 12 sequential wrong-password attempts on /api/admin/login all
// returned 401 against a limit of 8, and 70 requests to the public session
// endpoint produced zero 429s.
//
// These tests exist because that failure was invisible from the code -- the
// limiter looked correct and was simply never enforcing. They assert the
// observable behaviour (a 429 actually arrives) rather than any internal.

/**
 * A DEDICATED client address per test, and why that is not cheating.
 *
 * These tests work by exhausting a limiter on purpose. `clientIp()` falls back
 * to the literal string 'unknown' when neither `cf-connecting-ip` nor
 * `x-forwarded-for` is present - which is always, under `wrangler dev` - so
 * without this every attempt below is spent from the SAME bucket that every
 * other spec in the suite shares.
 *
 * The consequence was a suite that failed differently on every run. In one full
 * run this file left `/api/admin/login` throttled for the rest of its 15-minute
 * window and 40 later tests failed with "Too many login attempts" where they
 * expected "Invalid email or password" - a misleading `element(s) not found`
 * that points nowhere near the cause. A different run, with different ordering
 * and timing, failed 8 tests instead. The spec files' own comments already warn
 * about re-authenticating per test; this file was spending the budget they were
 * carefully conserving.
 *
 * Isolation costs these tests NOTHING, because each one still sends all of its
 * own attempts from a single address:
 *   - the ip:email counter is still exercised (test 2: one email, one address)
 *   - the ip-only counter is still exercised (test 3: forty DIFFERENT emails
 *     from ONE address, which is the only thing that can catch spraying)
 * What changes is only that the counter they exhaust is theirs.
 *
 * `cf-connecting-ip` is safe to set: Cloudflare overwrites it at the edge in
 * production, so a client cannot spoof it there.
 */
const PROBE_IPS = Object.freeze({
  publicState: '203.0.113.31',
  loginOneAccount: '203.0.113.32',
  loginSpray: '203.0.113.33',
})

test.describe('Pickleball rate limiting', () => {
  test('the public session endpoint starts refusing once the window is exceeded', async ({ request }) => {
    // Deliberately an unknown code: this proves the limiter runs BEFORE the
    // lookup, so code enumeration is what gets throttled.
    const path = '/api/pickleball/public/zzzzzzzzzz/state'

    let sawTooMany = false
    let firstLimitedAt = 0
    for (let i = 1; i <= 75; i += 1) {
      const response = await request.get(path, {
        headers: { 'cf-connecting-ip': PROBE_IPS.publicState },
      })
      if (response.status() === 429) {
        sawTooMany = true
        firstLimitedAt = i
        // A well-behaved client needs to know how long to wait.
        expect(Number(response.headers()['retry-after'] ?? 0)).toBeGreaterThan(0)
        break
      }
      expect(response.status()).toBe(404)
    }

    expect(sawTooMany, 'expected a 429 within 75 requests').toBe(true)
    // Not so eager that an ordinary 5s poll from a few viewers trips it.
    expect(firstLimitedAt).toBeGreaterThan(30)
  })

  test('the admin login refuses after repeated failures against one account', async ({ request }) => {
    // ONE email for every attempt. The limiter keys on ip:email, so varying
    // the address per request would spread the attempts across separate
    // counters and prove nothing -- which is exactly the mistake the first
    // version of this test made.
    const email = `rate-probe-${Date.now()}@example.com`

    let sawTooMany = false
    for (let i = 1; i <= 20; i += 1) {
      const response = await request.post('/api/admin/login', {
        data: { email, password: `wrong-${i}` },
        headers: { 'cf-connecting-ip': PROBE_IPS.loginOneAccount },
        failOnStatusCode: false,
      })
      if (response.status() === 429) {
        sawTooMany = true
        break
      }
      // 401 for a bad password, or 400/503 if password auth is not configured
      // in this environment -- either way it must not be a 200.
      expect(response.status()).not.toBe(200)
    }

    expect(sawTooMany, 'admin login accepted 20 failed attempts without throttling').toBe(true)
  })
  test('the admin login also refuses password spraying across many accounts', async ({ request }) => {
    // A DIFFERENT address every attempt, which defeats the ip:email counter
    // entirely. Only the ip-only limit can catch this, so this test fails if
    // that second limit is ever removed.
    let sawTooMany = false
    for (let i = 1; i <= 40; i += 1) {
      const response = await request.post('/api/admin/login', {
        // One address for all forty, deliberately: varying it would spread the
        // attempts across separate counters and prove nothing.
        headers: { 'cf-connecting-ip': PROBE_IPS.loginSpray },
        data: { email: `spray-${Date.now()}-${i}@example.com`, password: 'wrong' },
        failOnStatusCode: false,
      })
      if (response.status() === 429) {
        sawTooMany = true
        break
      }
      expect(response.status()).not.toBe(200)
    }

    expect(sawTooMany, 'spraying 40 distinct accounts from one address was never throttled').toBe(true)
  })
})
