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

  it('requires the Zoho integration before mailbox sync can be on', () => {
    const syncWithoutZoho = resolveFlags({ LEAD_ENGINE_ENABLED: 'true', ZOHO_MAIL_SYNC_ENABLED: 'true' })
    expect(syncWithoutZoho.zohoMailSync).toBe(false)

    const both = resolveFlags({
      LEAD_ENGINE_ENABLED: 'true',
      ZOHO_MAIL_ENABLED: 'true',
      ZOHO_MAIL_SYNC_ENABLED: 'true',
    })
    expect(both.zohoMailSync).toBe(true)
  })
})

describe('assertFlag', () => {
  it('throws a 503 naming the exact variable to set', () => {
    try {
      assertFlag({ LEAD_ENGINE_ENABLED: 'true' }, 'ai')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(FeatureDisabledError)
      expect(error.status).toBe(503)
      expect(error.flagKey).toBe('LEAD_AI_ENABLED')
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

  it('keeps production inert and enables only controlled preview research, AI review and Zoho drafting', () => {
    // Production remains fully inert. Preview deliberately exposes the CRM
    // shell, crawler, AI review and draft-only Zoho handoff for an
    // operator-triggered test. Discovery, browser rendering, mailbox sync and
    // schedules remain off.
    const enabledInPreview = new Set([
      FLAG_KEYS.engine,
      FLAG_KEYS.crawler,
      FLAG_KEYS.ai,
      FLAG_KEYS.zohoMail,
    ])

    for (const key of Object.values(FLAG_KEYS)) {
      const occurrences = [...wrangler.matchAll(new RegExp(`"${key}"\\s*:\\s*"(\\w+)"`, 'g'))].map((m) => m[1])

      expect(occurrences.length, `${key} should appear in production and preview vars`).toBe(2)
      expect(occurrences[0], `${key} must stay off in production`).toBe('false')
      expect(occurrences[1], `${key} has the wrong preview state`).toBe(enabledInPreview.has(key) ? 'true' : 'false')
    }
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
