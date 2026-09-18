import { describe, expect, it } from 'vitest'
import { IMPORT_LIMITS, parseDomainList, parseImportCsv } from './manualImport.js'

function csv(...lines) {
  return lines.join('\n')
}

describe('parseImportCsv', () => {
  it('maps columns by header, not by position', () => {
    // A positional parser breaks the first time someone reorders two columns in
    // a spreadsheet, and breaks silently.
    const { candidates, errors } = parseImportCsv(
      csv('City,Website,Company,Email', 'Austin,acme.com,Acme PM,hello@acme.com'),
    )

    expect(errors).toEqual([])
    expect(candidates[0]).toMatchObject({
      city: 'Austin',
      canonicalDomain: 'acme.com',
      name: 'Acme PM',
      email: 'hello@acme.com',
    })
  })

  it('accepts the header spellings spreadsheets actually produce', () => {
    const { candidates } = parseImportCsv(
      csv('Business Name,URL,Phone Number,State,Country Code,Industry', 'Acme,https://acme.com,+1 512 555 0100,TX,US,Property Management'),
    )

    expect(candidates[0]).toMatchObject({
      name: 'Acme',
      phone: '+1 512 555 0100',
      region: 'TX',
      countryCode: 'US',
      category: 'Property Management',
    })
  })

  it('reads a quoted field containing commas as one field', () => {
    const { candidates } = parseImportCsv(
      csv('name,street,website', 'Acme,"900 Congress Ave, Suite 400, Austin",acme.com'),
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0].canonicalDomain).toBe('acme.com')
  })

  it('reads a doubled quote inside a quoted field as one literal quote', () => {
    const { candidates } = parseImportCsv(csv('name,website', '"Acme ""Big"" Homes",acme.com'))
    expect(candidates[0].name).toBe('Acme "Big" Homes')
  })

  it('keeps line numbers honest when a quoted field contains a newline', () => {
    // Row three does not start on line three once a field wraps, and an error
    // pointing at the wrong line is worse than no error at all.
    const text = ['name,website', '"Acme\nProperty Management",acme.com', 'Broken,'].join('\n')
    const { candidates, errors } = parseImportCsv(text)

    expect(candidates).toHaveLength(1)
    expect(errors).toEqual([{ line: 4, reason: 'no_website' }])
  })

  it('reports each unusable row by line and keeps the usable ones', () => {
    const { candidates, errors } = parseImportCsv(
      csv(
        'name,website',
        'No Website,',
        'Social Only,https://facebook.com/acme',
        'Not A Url,N/A',
        'Good,acme.com',
      ),
    )

    expect(candidates.map((entry) => entry.canonicalDomain)).toEqual(['acme.com'])
    expect(errors).toEqual([
      { line: 2, reason: 'no_website' },
      { line: 3, reason: 'non_company_host' },
      { line: 4, reason: 'unparseable_website' },
    ])
  })

  it('refuses a file with no column that could hold a website', () => {
    const { candidates, errors } = parseImportCsv(csv('name,city,phone', 'Acme,Austin,555'))

    expect(candidates).toEqual([])
    expect(errors).toEqual([{ line: 1, reason: 'missing_website_column' }])
  })

  it('refuses an empty file rather than reporting a successful import of nothing', () => {
    expect(parseImportCsv('')).toEqual({ candidates: [], errors: [{ line: 1, reason: 'empty_file' }] })
    expect(parseImportCsv('   \n  \n')).toEqual({ candidates: [], errors: [{ line: 1, reason: 'empty_file' }] })
    expect(parseImportCsv(null)).toEqual({ candidates: [], errors: [{ line: 1, reason: 'empty_file' }] })
  })

  it('tolerates ragged rows, blank lines, CRLF and an Excel byte order mark', () => {
    const bom = String.fromCharCode(0xfeff)
    const text = `${bom}Name,Website,City\r\nAcme,acme.com\r\n\r\nBeta,beta.com,Manila\r\n`
    const { candidates, errors } = parseImportCsv(text)

    expect(errors).toEqual([])
    expect(candidates.map((entry) => entry.canonicalDomain)).toEqual(['acme.com', 'beta.com'])
    expect(candidates[0].city).toBe(null)
  })

  it('stops at the row ceiling and says so', () => {
    const rows = Array.from({ length: IMPORT_LIMITS.maxRows + 50 }, (_, index) => `Acme ${index},acme${index}.com`)
    const { candidates, errors } = parseImportCsv(csv('name,website', ...rows))

    expect(candidates).toHaveLength(IMPORT_LIMITS.maxRows)
    expect(errors).toEqual([{ line: IMPORT_LIMITS.maxRows + 1, reason: 'row_limit_exceeded' }])
  })
})

describe('parseDomainList', () => {
  it('accepts one domain or URL per line', () => {
    const { candidates, errors } = parseDomainList('acme.com\nhttps://www.beta.com/contact\n')

    expect(errors).toEqual([])
    expect(candidates.map((entry) => entry.canonicalDomain)).toEqual(['acme.com', 'beta.com'])
  })

  it('ignores blank lines and comments so a list can be annotated', () => {
    const { candidates, errors } = parseDomainList('# Austin shortlist\n\nacme.com\n\n  # from the conference\nbeta.com\n')

    expect(errors).toEqual([])
    expect(candidates).toHaveLength(2)
  })

  it('reports a bad line by its number rather than dropping it', () => {
    const { candidates, errors } = parseDomainList('acme.com\nfacebook.com/acme\nnot a domain\n')

    expect(candidates).toHaveLength(1)
    expect(errors).toEqual([
      { line: 2, reason: 'non_company_host' },
      { line: 3, reason: 'unparseable_website' },
    ])
  })

  it('stops at the row ceiling and says so', () => {
    const text = Array.from({ length: IMPORT_LIMITS.maxRows + 10 }, (_, index) => `acme${index}.com`).join('\n')
    const { candidates, errors } = parseDomainList(text)

    expect(candidates).toHaveLength(IMPORT_LIMITS.maxRows)
    expect(errors).toEqual([{ line: IMPORT_LIMITS.maxRows + 1, reason: 'row_limit_exceeded' }])
  })

  it('returns nothing for empty input', () => {
    expect(parseDomainList('')).toEqual({ candidates: [], errors: [] })
    expect(parseDomainList(undefined)).toEqual({ candidates: [], errors: [] })
  })
})
