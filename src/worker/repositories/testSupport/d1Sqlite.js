import { DatabaseSync } from 'node:sqlite'

/**
 * A minimal D1 interface over an in-memory SQLite database, for tests.
 *
 * Not a mock: the SQL actually runs. That matters for the parts of a repository
 * that are the SQL — `date('now', '-7 days')` arithmetic, ON CONFLICT clauses,
 * and ON DELETE CASCADE all behave here the way they behave in D1, and none of
 * them would be exercised at all by a stubbed `prepare()`.
 *
 * Only the surface the repositories use is implemented: prepare/bind, all,
 * first, run and batch.
 */

class Statement {
  constructor(db, sql, args = []) {
    this.db = db
    this.sql = sql
    this.args = args
  }

  bind(...args) {
    return new Statement(this.db, this.sql, args)
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true }
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.args)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}

class TestD1 {
  constructor(db) {
    this.db = db
  }

  prepare(sql) {
    return new Statement(this.db, sql)
  }

  /**
   * D1 runs a batch as one transaction, so this does too: a repository that
   * relies on batch atomicity would otherwise pass here and fail in production.
   */
  async batch(statements) {
    this.db.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

/** @param {string[]} schemaSql  migration files' contents, applied in order */
export function createTestD1(schemaSql = []) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const sql of schemaSql) db.exec(sql)
  return new TestD1(db)
}
