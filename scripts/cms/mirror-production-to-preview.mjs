/**
 * Mirrors PRODUCTION content into the PREVIEW database, so preview can be used
 * to visually verify a change against real content before it reaches
 * production.
 *
 * Direction is one-way and hard-coded: production is the source, preview is the
 * destination. There is deliberately no flag to reverse it.
 *
 * WHAT IS COPIED: content only. The allowlist below is exhaustive and is the
 * single place to change it.
 *
 * WHAT IS NEVER COPIED, and why:
 *   leads, delivery_attempts, lead_attribution,
 *   lead_consents, lead_activities     real people's names, emails, and the
 *                                      messages they sent. Copying customer PII
 *                                      into a second environment multiplies
 *                                      where it can leak from, for no benefit —
 *                                      you cannot visually check a lead.
 *   admin_session_revocations          security state belonging to one Worker.
 *   audit_log                          operational history containing admin
 *                                      identities; no visual value.
 *   content_versions                   large append-only history; no visual value.
 *   media_assets                       an index of the PRODUCTION R2 bucket.
 *                                      Preview has its own bucket; copying this
 *                                      would describe files that are not there.
 *   d1_migrations                      owned by wrangler. Copying it would make
 *                                      preview lie about its own schema state.
 *
 * Images still render on preview: content stores absolute production R2 URLs,
 * which are public, so preview loads them directly.
 *
 * Usage:
 *   node scripts/cms/mirror-production-to-preview.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Content tables, in an order where a parent is always created before its children. */
const CONTENT_TABLES = [
  'projects',
  'pages',
  'page_sections',
  'service_groups',
  'testimonials',
  'case_studies',
  'articles',
  'resources',
  'faqs',
  'experiences',
  'skills',
  'tools',
  'workflow_items',
  'seo_metadata',
  'navigation_items',
  'site_settings',
  'project_gallery_images',
  'certifications',
  'redirects',
]

/**
 * Delete order is the reverse dependency order: a child is removed before the
 * parent it references, so foreign keys hold at every intermediate step rather
 * than relying on deferred enforcement.
 */
const DELETE_ORDER = [
  'case_studies',
  'testimonials',
  'page_sections',
  'project_gallery_images',
  'redirects',
  'certifications',
  'site_settings',
  'navigation_items',
  'seo_metadata',
  'workflow_items',
  'tools',
  'skills',
  'experiences',
  'faqs',
  'resources',
  'articles',
  'service_groups',
  'pages',
  'projects',
]

/**
 * Tables that must never appear in the dump. Checked against the generated SQL
 * rather than trusted from the export flags — the allowlist and this denylist
 * are two independent statements of the same rule, so a typo in one is caught
 * by the other.
 */
const FORBIDDEN_TABLES = [
  'leads',
  'delivery_attempts',
  'lead_attribution',
  'lead_consents',
  'lead_activities',
  'admin_session_revocations',
  'audit_log',
  'content_versions',
  'media_assets',
  'd1_migrations',
]

const isDryRun = process.argv.includes('--dry-run')
const workDir = mkdtempSync(join(tmpdir(), 'devlab-mirror-'))
const dumpPath = join(workDir, 'production-content.sql')
const importPath = join(workDir, 'preview-import.sql')

/**
 * Runs wrangler's JS entry point directly under the current node binary,
 * with NO shell.
 *
 * `npx wrangler …` needs a shell on Windows (npx is a .cmd), and a shell joins
 * the argument array back into one command line — which silently mangles any
 * argument containing spaces or quotes, such as a SQL statement. Invoking the
 * script directly keeps arguments as an array all the way through.
 */
const WRANGLER_ENTRY = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function wrangler(args) {
  return execFileSync(process.execPath, [WRANGLER_ENTRY, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Counts every table in ONE row of scalar subqueries.
 *
 * Subqueries rather than UNION ALL because D1 rejects a compound SELECT with
 * this many terms ("too many terms in compound SELECT"). And `--command`
 * rather than `--file` because a file execution returns only a summary
 * (queries executed, rows read) — the actual result rows come back only from
 * `--command`.
 */
function rowCounts(envArgs) {
  const sql = `SELECT ${CONTENT_TABLES.map((table) => `(SELECT COUNT(*) FROM ${table}) AS ${table}`).join(', ')}`
  const raw = wrangler(['d1', 'execute', 'DB', ...envArgs, '--remote', '--json', '--command', sql])
  const parsed = JSON.parse(raw.slice(raw.indexOf('[')))
  const row = parsed[0]?.results?.[0] || {}
  return Object.fromEntries(CONTENT_TABLES.map((table) => [table, Number(row[table] ?? 0)]))
}

try {
  console.log('1/5  Exporting content tables from PRODUCTION…')
  wrangler([
    'd1', 'export', 'DB', '--remote', '--no-schema', '-y',
    '--output', dumpPath,
    ...CONTENT_TABLES.flatMap((table) => ['--table', table]),
  ])

  const dump = readFileSync(dumpPath, 'utf8')

  console.log('2/5  Verifying the dump carries no operational or personal data…')
  const leaked = FORBIDDEN_TABLES.filter((table) =>
    new RegExp(`INSERT INTO\\s+"?${table}"?[\\s(]`, 'i').test(dump),
  )
  if (leaked.length > 0) {
    throw new Error(`Refusing to continue: dump contains excluded table(s): ${leaked.join(', ')}`)
  }
  // Second, content-level check — a credential or session token must never
  // reach a second environment even if it somehow rode along in a content row.
  for (const pattern of [/pbkdf2_sha256\$/i, /devlab_admin_session/i]) {
    if (pattern.test(dump)) {
      throw new Error(`Refusing to continue: dump matched sensitive pattern ${pattern}`)
    }
  }

  const productionCounts = rowCounts([])
  console.log('     production rows:', JSON.stringify(productionCounts))

  console.log('3/5  Building the preview import…')
  const header = [
    '-- Generated by scripts/cms/mirror-production-to-preview.mjs. Do not edit.',
    '-- Replaces PREVIEW content with a copy of PRODUCTION content.',
    ...DELETE_ORDER.map((table) => `DELETE FROM ${table};`),
    '',
  ].join('\n')
  writeFileSync(importPath, `${header}${dump}`)

  if (isDryRun) {
    console.log(`\nDry run. Import SQL written to:\n  ${importPath}\nNothing was applied to preview.`)
    process.exit(0)
  }

  console.log('4/5  Applying to PREVIEW (replaces its content)…')
  wrangler(['d1', 'execute', 'DB', '--env', 'preview', '--remote', '-y', '--file', importPath])

  console.log('5/5  Verifying preview now matches production…')
  const previewCounts = rowCounts(['--env', 'preview'])
  const mismatches = CONTENT_TABLES.filter((table) => (productionCounts[table] ?? 0) !== (previewCounts[table] ?? 0))

  if (mismatches.length > 0) {
    console.error('\nRow counts differ after mirroring:')
    for (const table of mismatches) {
      console.error(`  ${table}: production=${productionCounts[table] ?? 0} preview=${previewCounts[table] ?? 0}`)
    }
    process.exit(1)
  }

  const total = Object.values(previewCounts).reduce((sum, n) => sum + n, 0)
  console.log(`\nPreview mirrored from production: ${total} rows across ${CONTENT_TABLES.length} content tables.`)
  console.log('Leads, delivery history, audit log, sessions and media metadata were not copied.')
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
