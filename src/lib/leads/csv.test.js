import { describe, it, expect } from 'vitest'
import { escapeCsvField, sanitizeCsvValue, toCsv } from './csv'

/**
 * The export is the one place lead data leaves the admin, and spreadsheets
 * execute cells. These tests are the guard on that.
 */

describe('sanitizeCsvValue — formula injection', () => {
  it.each(['=HYPERLINK("http://evil","click")', '+1+1', '-1+1', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'neutralizes a cell starting with a formula trigger: %s',
    (payload) => {
      expect(sanitizeCsvValue(payload).startsWith("'")).toBe(true)
    },
  )

  it('leaves an ordinary value untouched', () => {
    expect(sanitizeCsvValue('Acme Co')).toBe('Acme Co')
    expect(sanitizeCsvValue('dana@acme.co')).toBe('dana@acme.co')
  })

  it('does not treat a trigger character mid-string as dangerous', () => {
    expect(sanitizeCsvValue('Acme=Co')).toBe('Acme=Co')
  })

  it('renders null and undefined as empty, not as the literal words', () => {
    expect(sanitizeCsvValue(null)).toBe('')
    expect(sanitizeCsvValue(undefined)).toBe('')
  })
})

describe('escapeCsvField — CSV correctness', () => {
  it('quotes a value containing a comma', () => {
    expect(escapeCsvField('Reyes, Dana')).toBe('"Reyes, Dana"')
  })

  it('doubles embedded quotes', () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('quotes a value containing a newline', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"')
  })

  it('applies both escapes to a quoted formula payload', () => {
    const result = escapeCsvField('=cmd|"/c calc"!A1')
    expect(result.startsWith('"\'=')).toBe(true)
    expect(result).toContain('""')
  })
})

describe('toCsv', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'company', label: 'Company' },
  ]

  it('emits a header row followed by one row per record', () => {
    const csv = toCsv([{ name: 'Dana', company: 'Acme' }], columns)
    expect(csv).toBe('Name,Company\r\nDana,Acme')
  })

  it('uses CRLF line endings', () => {
    const csv = toCsv([{ name: 'A', company: 'B' }, { name: 'C', company: 'D' }], columns)
    expect(csv.split('\r\n')).toHaveLength(3)
  })

  it('emits only the header for an empty result set', () => {
    expect(toCsv([], columns)).toBe('Name,Company')
  })

  it('renders a missing column as empty rather than "undefined"', () => {
    const csv = toCsv([{ name: 'Dana' }], columns)
    expect(csv).toBe('Name,Company\r\nDana,')
  })
})
