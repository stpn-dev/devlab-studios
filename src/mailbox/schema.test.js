import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_MAILBOXES, MAILBOX } from './domain/mailboxes.js'
import { MAILBOX_PROVIDER } from './services/bridge.js'

/**
 * Schema and code, asserted to agree.
 *
 * THIS TEST EXISTS BECAUSE THE SAME BUG HAS SHIPPED THREE TIMES. A CHECK
 * constraint rejected a value the code had started using, an `INSERT OR IGNORE`
 * swallowed the rejection, and the row silently vanished —
 * `lead_usage_daily.metric`, `lead_sources.type` and `lead_suppression.source`,
 * each found only by running the real thing against a real database. Nothing
 * errored, and every unit test passed, because unit tests use fakes that have
 * no constraints at all.
 *
 * So these assertions read the migration FILE. They are the one kind of test
 * that can catch a disagreement between what SQLite will accept and what the
 * code intends to write.
 */

// Resolved from this file rather than from `process.cwd()`: the lint config
// gives `.js` files browser globals, and a test that only runs from the repo
// root is a test that breaks the first time someone runs it from elsewhere.
const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(HERE, '..', '..')
const MIGRATIONS = join(ROOT, 'migrations')
const mailboxSql = readFileSync(join(MIGRATIONS, '0014_mailbox.sql'), 'utf8')
const leadEngineSql = readFileSync(join(MIGRATIONS, '0012_lead_intelligence_engine.sql'), 'utf8')

/** Reads the allowed values out of a `CHECK (col IN ('a', 'b'))` for one column. */
function checkValues(sql, column) {
  const match = new RegExp(`${column}[^,]*?CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, 'is').exec(sql)
  if (!match) return null
  return match[1]
    .split(',')
    .map((value) => value.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort()
}

/** Whether a column carries any CHECK at all. */
function hasCheck(sql, table, column) {
  const table_ = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)
  if (!table_) throw new Error(`Table ${table} not found in the migration.`)

  const line = table_[1]
    .split('\n')
    .find((candidate) => new RegExp(`^\\s*${column}\\s`, 'i').test(candidate))
  if (!line) throw new Error(`Column ${table}.${column} not found.`)

  // A CHECK can continue onto the next line; take from this column's line to
  // the start of the next column definition.
  const body = table_[1]
  const start = body.indexOf(line)
  const rest = body.slice(start)
  const end = rest.indexOf('\n  ', 1)
  return /CHECK\s*\(/i.test(end === -1 ? rest : rest.slice(0, end))
}

describe('mailbox column vocabularies', () => {
  it('leaves `mailbox` unconstrained, so the code vocabulary is the enforcement', () => {
    // If someone adds a CHECK here later, a new address (abuse@, a campaign
    // address) would be rejected by SQLite and — behind the wrong insert —
    // vanish. domain/mailboxes.js is the vocabulary, the same way
    // domain/activity.js is for lead_activity.event_type.
    expect(hasCheck(mailboxSql, 'mailbox_threads', 'mailbox')).toBe(false)
    expect(hasCheck(mailboxSql, 'mailbox_messages', 'mailbox')).toBe(false)
    expect(hasCheck(mailboxSql, 'mailbox_outbound', 'mailbox')).toBe(false)
  })

  it('has a mailbox vocabulary that is closed and covers the routed addresses', () => {
    expect(ALL_MAILBOXES).toEqual(
      expect.arrayContaining([MAILBOX.HELLO, MAILBOX.BOUNCE, MAILBOX.DMARC, MAILBOX.POSTMASTER, MAILBOX.ABUSE, MAILBOX.OTHER]),
    )
    expect(new Set(ALL_MAILBOXES).size).toBe(ALL_MAILBOXES.length)
  })

  it('constrains the genuinely closed sets, with exactly the values the code writes', () => {
    expect(checkValues(mailboxSql, 'direction')).toEqual(['inbound', 'outbound'])
    expect(checkValues(mailboxSql, 'state')).toEqual(['archived', 'inbox', 'trash'])
    expect(checkValues(mailboxSql, 'parse_status')).toEqual(
      ['failed', 'ok', 'partial', 'raw_unavailable', 'skipped_too_large'],
    )
    expect(checkValues(mailboxSql, 'status')).toEqual(
      ['cancelled', 'collected', 'failed', 'queued', 'sent'],
    )
  })
})

describe('the bridge into the lead engine', () => {
  it('writes a provider value that lead_messages will accept', () => {
    // `lead_messages.provider` defaults to 'zoho'. If it ever gains a CHECK,
    // every bridged message would be silently discarded by the same mechanism
    // that has already cost this schema three incidents — so this asserts the
    // absence rather than trusting it.
    expect(hasCheck(leadEngineSql, 'lead_messages', 'provider')).toBe(false)
    expect(MAILBOX_PROVIDER).toBe('devlabconnect')
  })
})

describe('no INSERT OR IGNORE in the mailbox', () => {
  it('never uses the statement form that hides constraint violations', () => {
    // The root-cause fix rather than another workaround. `INSERT OR IGNORE` is
    // what turned three CHECK violations into missing rows; without it, a
    // violation is an exception somebody sees.
    const offenders = []

    // Comments are stripped first. Half this codebase EXPLAINS why it does not
    // use `INSERT OR IGNORE`, and a test that cannot tell an explanation from a
    // statement fails on its own documentation.
    const withoutComments = (source) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

    const walk = (directory) => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry)
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
        if (!entry.endsWith('.js') || entry.endsWith('.test.js')) continue
        if (/INSERT\s+OR\s+IGNORE/i.test(withoutComments(readFileSync(path, 'utf8')))) offenders.push(path)
      }
    }

    walk(join(ROOT, 'src', 'mailbox'))
    expect(offenders).toEqual([])
  })
})
