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
 * State is in-memory rather than in `ctx.storage`, deliberately. An eviction
 * resets a window, which is the same effect as the window simply expiring, and
 * an object stays alive while it is being hit -- which is exactly when the
 * counter matters. Storage would add a write to every single check for no
 * defensive gain.
 */
interface Window {
  count: number
  resetAt: number
}

export class RateLimiterDO extends DurableObject {
  private windows = new Map<string, Window>()

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
    const existing = this.windows.get(key)

    if (!existing || now >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs })
      // Opportunistic cleanup so a long-lived object holding many keys does
      // not grow without bound. Cheap: only runs when a window rolls over.
      if (this.windows.size > 5_000) {
        for (const [k, w] of this.windows) if (now >= w.resetAt) this.windows.delete(k)
      }
      return { limited: false, retryAfterSeconds: 0 }
    }

    existing.count += 1
    const limited = existing.count > limit
    return { limited, retryAfterSeconds: limited ? Math.ceil((existing.resetAt - now) / 1000) : 0 }
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
    const existing = this.windows.get(key)
    if (!existing || now >= existing.resetAt) return { limited: false, retryAfterSeconds: 0 }

    const limited = existing.count >= limit
    return { limited, retryAfterSeconds: limited ? Math.ceil((existing.resetAt - now) / 1000) : 0 }
  }

  /** Counts one attempt against `key` without reporting a verdict. */
  async record(key: string, windowMs: number): Promise<void> {
    const now = Date.now()
    const existing = this.windows.get(key)

    if (!existing || now >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs })
      return
    }
    existing.count += 1
  }

  /**
   * Clears a key's window -- for the "successful login wipes the failure
   * count" case, so a legitimate user who mistyped twice is not left throttled.
   */
  async reset(key: string): Promise<void> {
    this.windows.delete(key)
  }
}
