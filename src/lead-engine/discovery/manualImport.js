/**
 * Operator-supplied discovery: a pasted CSV, or a plain list of domains.
 *
 * This is the source with no API, no rate limit and no policy question — an
 * operator already has a list (a conference attendee export, an association
 * directory they are entitled to use, a spreadsheet of referrals) and wants it
 * in the pipeline. It is also the source most likely to be MALFORMED, because
 * it was assembled by hand in a spreadsheet: merged cells, a header in row
 * three, "N/A" in the website column, addresses containing commas.
 *
 * So the contract is per-row: every row that can be used is used, and every row
 * that cannot produces an `{ line, reason }` the operator can act on. An import
 * of 500 rows with 12 bad ones must import 488 leads and show 12 line numbers —
 * not fail, and not silently drop 12 businesses.
 *
 * The CSV parser here is deliberately small and deliberately RFC 4180 on the
 * points that matter: quoted fields may contain commas and newlines, and `""`
 * inside a quoted field is one literal quote. Everything else — a stray quote
 * mid-field, a ragged row — is taken literally rather than rejected, because an
 * operator's spreadsheet export is not going to be repaired by being refused.
 */

import { normalizeCandidate } from './normalize.js'

/** Import policy. */
export const IMPORT_LIMITS = Object.freeze({
  /**
   * Data rows read per import. An import runs inside one Worker request, and
   * 5000 rows is already far more than the daily discovery budget will admit;
   * beyond it the operator is pasting a database dump by accident.
   */
  maxRows: 5_000,
  /** Bytes of text accepted, as a second bound for a file with no line breaks. */
  maxTextLength: 4_000_000,
})

/**
 * Recognised column headers, in the spellings spreadsheets actually produce.
 *
 * Column ORDER is never assumed — the header row is what maps a column to a
 * field. A positional parser breaks the first time someone reorders two columns
 * in Excel, and breaks silently, writing phone numbers into the city field.
 */
const COLUMN_ALIASES = Object.freeze({
  name: ['name', 'company', 'company name', 'business', 'business name', 'organisation', 'organization'],
  website: ['website', 'website url', 'url', 'domain', 'web', 'web site', 'site'],
  email: ['email', 'e mail', 'email address', 'contact email'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'contact phone'],
  city: ['city', 'town', 'locality'],
  region: ['region', 'state', 'province', 'county'],
  country: ['country', 'country code'],
  category: ['category', 'industry', 'sector', 'type', 'business type'],
})

/**
 * Normalizes a header cell for alias matching: case, punctuation and a UTF-8
 * BOM (which Excel writes, and which would otherwise make the first column
 * header unmatchable) all stop mattering.
 *
 * @param {string} value
 */
/** U+FEFF, compared by code point so the character itself is never in source. */
const BYTE_ORDER_MARK = 0xfeff

function headerKey(value) {
  const raw = String(value ?? '')
  return (raw.charCodeAt(0) === BYTE_ORDER_MARK ? raw.slice(1) : raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Maps header cells to field names by index.
 *
 * A duplicated header keeps the FIRST occurrence: a spreadsheet with two
 * "Email" columns usually has the real one first and a blank copy after.
 *
 * @param {string[]} cells
 * @returns {Record<string, number>}
 */
function mapColumns(cells) {
  const columns = {}

  cells.forEach((cell, index) => {
    const key = headerKey(cell)
    if (!key) return
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (columns[field] === undefined && aliases.includes(key)) columns[field] = index
    }
  })

  return columns
}

/**
 * Splits CSV text into rows, tracking the 1-based line each row started on.
 *
 * Line numbers are tracked rather than derived from the row index because a
 * quoted field may contain newlines — so row 4 is not necessarily line 5, and
 * an error message pointing at the wrong line is worse than none.
 *
 * @param {string} text
 * @param {number} maxRows including the header row
 * @returns {{ rows: Array<{ line: number, cells: string[] }>, truncated: boolean }}
 */
function parseCsvRows(text, maxRows) {
  const rows = []
  let cells = []
  let field = ''
  let inQuotes = false
  let line = 1
  let rowStartLine = 1
  let truncated = false

  const pushRow = () => {
    cells.push(field)
    field = ''
    // A line with nothing on it is spreadsheet padding, not a row.
    const empty = cells.every((cell) => cell.trim() === '')
    if (!empty) rows.push({ line: rowStartLine, cells })
    cells = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is one literal quote; a single one closes the field.
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
        continue
      }
      if (char === '\n') line += 1
      field += char
      continue
    }

    // Only a quote at the START of a field opens a quoted field. A quote in the
    // middle of `6" pipe` is just a character.
    if (char === '"' && field === '') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      cells.push(field)
      field = ''
      continue
    }
    if (char === '\r') continue
    if (char === '\n') {
      pushRow()
      line += 1
      rowStartLine = line
      if (rows.length >= maxRows) {
        truncated = index < text.length - 1
        return { rows, truncated }
      }
      continue
    }

    field += char
  }

  if (field !== '' || cells.length > 0) pushRow()
  return { rows, truncated }
}

/**
 * Reads one mapped row into a raw candidate.
 *
 * @param {string[]} cells
 * @param {Record<string, number>} columns
 */
function rowToRaw(cells, columns) {
  const cell = (field) => (columns[field] === undefined ? '' : (cells[columns[field]] ?? ''))

  return {
    name: cell('name'),
    websiteUrl: cell('website'),
    email: cell('email'),
    phone: cell('phone'),
    city: cell('city'),
    region: cell('region'),
    country: cell('country'),
    category: cell('category'),
    payload: { source: 'manual_import' },
  }
}

/**
 * Parses an operator-supplied CSV.
 *
 * @param {string} text
 * @returns {{ candidates: object[], errors: Array<{ line: number, reason: string }> }}
 */
export function parseImportCsv(text) {
  const source = String(text ?? '')
  if (source.length > IMPORT_LIMITS.maxTextLength) {
    return { candidates: [], errors: [{ line: 1, reason: 'file_too_large' }] }
  }
  if (!source.trim()) return { candidates: [], errors: [{ line: 1, reason: 'empty_file' }] }

  const { rows, truncated } = parseCsvRows(source, IMPORT_LIMITS.maxRows + 1)
  if (rows.length === 0) return { candidates: [], errors: [{ line: 1, reason: 'empty_file' }] }

  const [header, ...dataRows] = rows
  const columns = mapColumns(header.cells)
  // Without a website column there is nothing to identify a company by, and
  // guessing which column holds URLs would be worse than saying so.
  if (columns.website === undefined) {
    return { candidates: [], errors: [{ line: header.line, reason: 'missing_website_column' }] }
  }

  const candidates = []
  const errors = []

  for (const row of dataRows) {
    const result = normalizeCandidate(rowToRaw(row.cells, columns))
    if (result.ok) candidates.push(result.candidate)
    else errors.push({ line: row.line, reason: result.reason })
  }

  if (truncated) {
    errors.push({ line: rows[rows.length - 1].line, reason: 'row_limit_exceeded' })
  }

  return { candidates, errors }
}

/**
 * Parses a plain list of domains or URLs, one per line.
 *
 * The lowest-ceremony import: an operator with a list of domains and nothing
 * else should not have to build a CSV. Blank lines and `#` comments are
 * ignored so a list can be annotated.
 *
 * @param {string} text
 * @returns {{ candidates: object[], errors: Array<{ line: number, reason: string }> }}
 */
export function parseDomainList(text) {
  const source = String(text ?? '')
  if (source.length > IMPORT_LIMITS.maxTextLength) {
    return { candidates: [], errors: [{ line: 1, reason: 'file_too_large' }] }
  }

  const candidates = []
  const errors = []
  const lines = source.split('\n')
  let accepted = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1
    const entry = lines[index].trim()
    if (!entry || entry.startsWith('#')) continue

    if (accepted >= IMPORT_LIMITS.maxRows) {
      errors.push({ line, reason: 'row_limit_exceeded' })
      break
    }
    accepted += 1

    const result = normalizeCandidate({ websiteUrl: entry, payload: { source: 'manual_import' } })
    if (result.ok) candidates.push(result.candidate)
    else errors.push({ line, reason: result.reason })
  }

  return { candidates, errors }
}
