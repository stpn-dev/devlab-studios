/**
 * CSV serialization for the admin lead export.
 *
 * Two separate problems are solved here and they need different escapes:
 *
 *  1. CSV correctness — a value containing a comma, quote, or newline must be
 *     quoted and its quotes doubled, or the file parses into the wrong shape.
 *
 *  2. Formula injection — Excel, Google Sheets, and LibreOffice will EXECUTE a
 *     cell beginning with = + - @ or a control character. A lead whose company
 *     name is `=HYPERLINK(...)` becomes a live payload the moment an operator
 *     opens the export. Such a cell is prefixed with an apostrophe, which the
 *     spreadsheet strips on display but which stops evaluation.
 *
 * Both are applied to every field. Nothing is exempt, because a "safe" column
 * today is one schema change away from being attacker-controlled.
 */

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/

export function sanitizeCsvValue(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  return FORMULA_TRIGGERS.test(raw) ? `'${raw}` : raw
}

export function escapeCsvField(value: unknown): string {
  const sanitized = sanitizeCsvValue(value)
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`
  }
  return sanitized
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const header = columns.map((column) => escapeCsvField(column.label)).join(',')
  const body = rows.map((row) => columns.map((column) => escapeCsvField(row[column.key])).join(','))
  // CRLF is what the CSV RFC specifies and what Excel expects.
  return [header, ...body].join('\r\n')
}
