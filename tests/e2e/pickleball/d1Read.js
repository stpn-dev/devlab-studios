import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Read-only local D1 queries, for assertions on tables that have no read API
 * (`player_game_stats`, `matchmaking_history`, `public_session_tokens`).
 *
 * WHY NOT `wrangler d1 execute --local`
 *
 * That is what both callers used to do, and it is the cause of the Pickleball
 * suite's long-standing local instability. It spawns a second process that
 * opens the SQLite file miniflare already holds **read-write**. Under parallel
 * Playwright workers that reliably produced:
 *
 *   - `SQLITE_BUSY` in the reader, and
 *   - `D1_ERROR: internal error` / `Uncaught Error: Network connection lost`
 *     inside the dev worker itself, killing it mid-suite so every remaining
 *     test failed with ECONNREFUSED.
 *
 * A cross-process lock between readers did not fix it, because the contention
 * is between the reader and miniflare's writes, not between readers.
 *
 * This opens the same file **read-only** through `node:sqlite` instead. SQLite
 * in WAL mode supports concurrent readers alongside a writer, so a read-only
 * connection does not block miniflare and cannot checkpoint or upgrade the
 * journal underneath it. No second process, no lock needed.
 *
 * NEVER used to write. Every mutation in these suites goes through the real
 * API, and the connection is opened read-only so that is enforced rather than
 * merely intended.
 */

const D1_DIR = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')

/**
 * Miniflare names each local D1 file after an internal hash, so the mapping
 * from database name to file is not derivable here. Identify it by a table
 * only that database has, and remember the answer.
 */
const resolvedPaths = new Map()

function resolveDatabasePath(marker) {
  const cached = resolvedPaths.get(marker)
  if (cached) return cached

  const candidates = readdirSync(D1_DIR).filter(
    (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite',
  )

  for (const name of candidates) {
    const path = join(D1_DIR, name)
    try {
      const db = new DatabaseSync(path, { readOnly: true })
      try {
        const row = db
          .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(marker)
        if (row?.present) {
          resolvedPaths.set(marker, path)
          return path
        }
      } finally {
        db.close()
      }
    } catch {
      // A file we cannot open read-only is not the one we are looking for.
    }
  }

  throw new Error(
    `No local D1 database contains the table "${marker}". Apply migrations first: ` +
      'npx wrangler d1 migrations apply devlab-pickleball --local',
  )
}

/**
 * Runs a read-only query against the local Pickleball D1 and returns its rows.
 *
 * @param {string} sql
 * @param {string} [marker] a table unique to the target database
 * @returns {Array<Record<string, unknown>>}
 */
export function queryLocalD1(sql, marker = 'matchmaking_history') {
  const db = new DatabaseSync(resolveDatabasePath(marker), { readOnly: true })
  try {
    return db.prepare(sql).all()
  } finally {
    db.close()
  }
}
