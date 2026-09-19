import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertFlag, FeatureDisabledError, FLAG_KEYS, isFlagOn, resolveFlags } from './flags.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

describe('isFlagOn', () => {
  it('accepts the affirmative spellings an operator might use', () => {
    for (const value of ['true', 'TRUE', 'True', '1', 'on', 'yes']) {
      expect(isFlagOn(value), value).toBe(true)
    }
  })

  it('treats the string "false" as off', () => {
    // The trap this guards: Cloudflare vars are always strings, and
    // Boolean('false') is true.
    expect(isFlagOn('false')).toBe(false)
    expect(isFlagOn('FALSE')).toBe(false)
    expect(isFlagOn('0')).toBe(false)
    expect(isFlagOn('off')).toBe(false)
  })

  it('treats absence as off', () => {
    expect(isFlagOn(undefined)).toBe(false)
    expect(isFlagOn(null)).toBe(false)
    expect(isFlagOn('')).toBe(false)
    expect(isFlagOn('   ')).toBe(false)
  })
})

describe('resolveFlags', () => {
  it('is entirely off for an empty environment', () => {
    const flags = resolveFlags({})
    for (const [name, value] of Object.entries(flags)) {
      expect(value, name).toBe(false)
    }
  })

  it('is entirely off when the master switch is off, whatever else is set', () => {
    // The safe direction to fail in: a deploy that enables AI but forgets the
    // master switch does nothing.
    const flags = resolveFlags({
      LEAD_DISCOVERY_ENABLED: 'true',
      LEAD_CRAWLER_ENABLED: 'true',
      LEAD_AI_ENABLED: 'true',
      ZOHO_MAIL_ENABLED: 'true',
      ZOHO_MAIL_SYNC_ENABLED: 'true',
    })

    for (const [name, value] of Object.entries(flags)) {
      expect(value, name).toBe(false)
    }
  })

  it('enables only what is explicitly set, once the master switch is on', () => {
    const flags = resolveFlags({ LEAD_ENGINE_ENABLED: 'true', LEAD_CRAWLER_ENABLED: 'true' })

    expect(flags.engine).toBe(true)
    expect(flags.crawler).toBe(true)
    expect(flags.discovery).toBe(false)
    expect(flags.ai).toBe(false)
  })

  it('declares no mail-provider flag, because there is no mail provider', () => {
    // The mailbox integration was removed after a Worker's rotating egress IPs
    // got the account blocked for suspicious logins. Drafts are exported as
    // files now, which needs no provider and therefore no switch to gate.
    expect(Object.keys(FLAG_KEYS).join(' ')).not.toMatch(/zoho|mailbox|smtp/i)
  })
})

describe('assertFlag', () => {
  it('throws a 503 naming the UI control and deployment ceiling', () => {
    try {
      assertFlag({ LEAD_ENGINE_ENABLED: 'true' }, 'ai')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(FeatureDisabledError)
      expect(error.status).toBe(503)
      expect(error.flagKey).toBe('LEAD_AI_ENABLED')
      expect(error.message).toContain('Lead CRM Settings')
      expect(error.message).toContain('LEAD_AI_ENABLED')
    }
  })

  it('names the master switch when that is what is missing', () => {
    try {
      assertFlag({}, 'crawler')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error.flagKey).toBe('LEAD_ENGINE_ENABLED')
    }
  })

  it('does not throw when the flag is on', () => {
    expect(() => assertFlag({ LEAD_ENGINE_ENABLED: 'true', LEAD_AI_ENABLED: 'true' }, 'ai')).not.toThrow()
  })
})

describe('shipped configuration', () => {
  const wrangler = readFileSync(resolve(repoRoot, 'wrangler.jsonc'), 'utf8')

  /** Every flag's value in production and preview, in file order. */
  const occurrencesOf = (key) =>
    [...wrangler.matchAll(new RegExp(`"${key}"\\s*:\\s*"(\\w+)"`, 'g'))].map((match) => match[1])

  it('declares every flag in both environments', () => {
    // Nothing at the top level is inherited by an environment. A flag named
    // only in production leaves preview falling back to an unset var, which
    // reads as off and looks like a bug in the engine rather than in config.
    for (const key of Object.values(FLAG_KEYS)) {
      expect(occurrencesOf(key).length, `${key} should appear in production and preview vars`).toBe(2)
    }
  })

  it('keeps production and preview in agreement', () => {
    // Drift between the two is how a capability gets validated in preview and
    // then silently behaves differently in production.
    for (const key of Object.values(FLAG_KEYS)) {
      const [production, preview] = occurrencesOf(key)

      expect(preview, `${key} differs between production and preview`).toBe(production)
    }
  })

  it('keeps unattended running shut', () => {
    // These vars are deployment CEILINGS, not the requested runtime state: D1
    // decides routine operation and can only turn an allowed capability off.
    // That makes an open ceiling safe for most capabilities and unsafe for this
    // one, which is what lets campaigns run with nobody asking them to. It stays
    // false until a manual dry run AND a manual real run have both been
    // inspected end to end. Raising it is a deliberate act, not a default.
    expect(occurrencesOf(FLAG_KEYS.campaignSchedules)).toEqual(['false', 'false'])
  })

  it('keeps browser rendering shut while it has no credentials', () => {
    // Browser rendering needs CLOUDFLARE_ACCOUNT_ID and
    // BROWSER_RENDERING_API_TOKEN. Neither is set on either worker, so an open
    // ceiling would let the UI switch on a capability that fails inside every
    // research job it touches. A test cannot see the secret store, so this is a
    // tripwire: set the secrets, then change this line on purpose.
    expect(occurrencesOf(FLAG_KEYS.browserRun)).toEqual(['false', 'false'])
  })

  it('declares no auto-send flag anywhere', () => {
    // There is no automated prospect sending to gate, and a flag would imply a
    // switch exists.
    expect(Object.values(FLAG_KEYS).join(' ')).not.toMatch(/AUTO_SEND|SEND_ENABLED/i)
    expect(wrangler).not.toMatch(/LEAD_AUTO_SEND|LEAD_SEND_ENABLED/)
  })

  it('keeps the Queues and Workflows bindings commented out', () => {
    // A binding naming a queue or Workflow that does not exist fails
    // `wrangler deploy` for the whole Worker, public site included.
    const uncommented = wrangler
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(uncommented).not.toMatch(/"queues"\s*:/)
    expect(uncommented).not.toMatch(/"workflows"\s*:/)
  })
})
