import { DurableObject } from 'cloudflare:workers'

/**
 * A rate limiter that actually works on Workers.
 *
 * The limiters this replaces were module-scope `Map`s. On Workers every
 * isolate gets its own memory and isolates are created and discarded freely,
 * so those counters almost never saw the same client twice: 12 sequential
 * wrong-password attempts against /api/admin/login from one IP were measured
 * against production and every one returned 401, with the limiter configured
 * to stop at 8. It was not throttling a distributed attacker less well than
 * intended -- it was not throttling the simplest possible attack at all.
 *
 * A Durable Object fixes that because `idFromName(key)` routes every request
 * carrying the same key to the SAME object instance, wherever in the world it
 * originates, so one counter sees every attempt.
 *
 * State lives in `ctx.storage`, NOT in memory. An in-memory Map was tried
 * first and measurably did not hold: against production, attempts 9 and 10
 * were correctly refused with 429 and then 11 and 12 were allowed through
 * again, because Cloudflare had evicted the object between requests and the
 * counter went with it. A limiter that forgets mid-attack is not a limiter.
 * The cost is one small read and write per check, which is the right price.
 */
interface Window {
  count: number
  resetAt: number
}

export class RateLimiterDO extends DurableObject {
  private async load(key: string): Promise<Window | undefined> {
    return await this.ctx.storage.get<Window>(key)
  }

  private async save(key: string, window: Window, windowMs: number): Promise<void> {
    await this.ctx.storage.put(key, window)
    // Let the runtime discard the row once the window is irrelevant, so a
    // long-lived object does not accumulate keys forever.
    await this.ctx.storage.setAlarm(Date.now() + windowMs + 60_000)
  }

  /** Drops every window that has already expired. */
  async alarm(): Promise<void> {
    const now = Date.now()
    const all = await this.ctx.storage.list<Window>()
    for (const [key, window] of all) {
      if (now >= window.resetAt) await this.ctx.storage.delete(key)
    }
  }

  /**
   * Records one attempt against `key` and reports whether the caller is now
   * over its allowance.
   *
   * Counting on every call (rather than only on failures) is what makes this
   * usable for both "too many login attempts" and "too many requests": a
   * caller that is already over the limit stays over it until the window
   * expires, so hammering cannot reset the clock.
   */
  async check(key: string, limit: number, windowMs: number): Promise<{ limited: boolean; retryAfterSeconds: number }> {
    const now = Date.now()
    const existing = await this.load(key)

    if (!existing || now >= existing.resetAt) {
      await this.save(key, { count: 1, resetAt: now + windowMs }, windowMs)
      return { limited: false, retryAfterSeconds: 0 }
    }

    const next = { count: existing.count + 1, resetAt: existing.resetAt }
    await this.save(key, next, windowMs)

    const limited = next.count > limit
    return { limited, retryAfterSeconds: limited ? Math.ceil((next.resetAt - now) / 1000) : 0 }
  }

  /**
   * Read-only: is this key already over its allowance?
   *
   * Paired with `record` for call sites that count only FAILURES -- the
   * pickleball login does this deliberately, so a user who signs in
   * successfully is never penalised for it. `check` above is the right call
   * when every attempt should count.
   */
  async peek(key: string, limit: number): Promise<{ limited: boolean; retryAfterSeconds: number }> {
    const now = Date.now()
    const existing = await this.load(key)
    if (!existing || now >= existing.resetAt) return { limited: false, retryAfterSeconds: 0 }

    const limited = existing.count >= limit
    return { limited, retryAfterSeconds: limited ? Math.ceil((existing.resetAt - now) / 1000) : 0 }
  }

  /** Counts one attempt against `key` without reporting a verdict. */
  async record(key: string, windowMs: number): Promise<void> {
    const now = Date.now()
    const existing = await this.load(key)

    if (!existing || now >= existing.resetAt) {
      await this.save(key, { count: 1, resetAt: now + windowMs }, windowMs)
      return
    }
    await this.save(key, { count: existing.count + 1, resetAt: existing.resetAt }, windowMs)
  }

  /**
   * Clears a key's window -- for the "successful login wipes the failure
   * count" case, so a legitimate user who mistyped twice is not left throttled.
   */
  async reset(key: string): Promise<void> {
    await this.ctx.storage.delete(key)
  }
}
