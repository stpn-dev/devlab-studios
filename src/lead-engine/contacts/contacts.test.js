import { describe, expect, it, vi } from 'vitest'
import { classifyEmailType, isStorableContact, rankContacts, selectContacts } from './discover.js'
import { checkSyntax, describeMxState, domainMatchesCompany, lookupMx, validateContact } from './validate.js'

function dnsResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/dns-json' } })
}

describe('classifyEmailType', () => {
  it('recognises published role addresses', () => {
    for (const local of ['hello', 'info', 'contact', 'sales', 'operations']) {
      expect(classifyEmailType(`${local}@acme.com`, 'acme.com'), local).toBe('role')
    }
  })

  it('recognises a named address at the company domain', () => {
    expect(classifyEmailType('jane@acme.com', 'acme.com')).toBe('named')
    expect(classifyEmailType('jane.doe@acme.com', 'acme.com')).toBe('named')
  })

  it('does not call a personal address at another domain "named"', () => {
    expect(classifyEmailType('jane@gmail.com', 'acme.com')).toBe('generic')
  })
})

describe('isStorableContact', () => {
  it('refuses addresses that are not business-development contacts', () => {
    for (const local of ['abuse', 'postmaster', 'noreply', 'privacy', 'dmca', 'unsubscribe', 'careers']) {
      expect(isStorableContact(`${local}@acme.com`).usable, local).toBe(false)
    }
  })

  it('refuses a machine-generated ticketing address', () => {
    expect(isStorableContact('a1b2c3d4e5f60718@acme.com').usable).toBe(false)
  })

  it('accepts an ordinary business address', () => {
    expect(isStorableContact('hello@acme.com').usable).toBe(true)
  })
})

describe('rankContacts', () => {
  it('prefers a role address at the company domain', () => {
    const ranked = rankContacts(
      [
        { email: 'jane@acme.com', sourceUrl: 'https://acme.com/team', sourceType: 'company_team_page' },
        { email: 'hello@acme.com', sourceUrl: 'https://acme.com/contact', sourceType: 'company_contact_page' },
        { email: 'acme@gmail.com', sourceUrl: 'https://acme.com/', sourceType: 'company_homepage' },
      ],
      'https://acme.com',
    )

    expect(ranked[0].email).toBe('hello@acme.com')
    expect(ranked[0].isPrimary).toBe(true)
    expect(ranked[0].emailType).toBe('role')
  })

  it('prefers the company domain over an off-domain role address', () => {
    const ranked = rankContacts(
      [
        { email: 'info@gmail.com', sourceUrl: 'https://acme.com/', sourceType: 'company_homepage' },
        { email: 'jane@acme.com', sourceUrl: 'https://acme.com/team', sourceType: 'company_team_page' },
      ],
      'https://acme.com',
    )
    expect(ranked[0].email).toBe('jane@acme.com')
  })

  it('records provenance on every contact it returns', () => {
    const [contact] = rankContacts(
      [{ email: 'hello@acme.com', sourceUrl: 'https://acme.com/contact', sourceType: 'company_contact_page' }],
      'https://acme.com',
    )

    expect(contact.sourceUrl).toBe('https://acme.com/contact')
    expect(contact.sourceType).toBe('company_contact_page')
    expect(contact.publishedPublicly).toBe(true)
    expect(contact.domainMatchesCompany).toBe(true)
  })

  it('drops excluded and duplicate addresses', () => {
    const ranked = rankContacts(
      [
        { email: 'hello@acme.com', sourceUrl: 'https://acme.com/contact', sourceType: 'company_contact_page' },
        { email: 'HELLO@acme.com', sourceUrl: 'https://acme.com/', sourceType: 'company_homepage' },
        { email: 'noreply@acme.com', sourceUrl: 'https://acme.com/', sourceType: 'company_homepage' },
      ],
      'https://acme.com',
    )

    expect(ranked).toHaveLength(1)
  })

  it('marks exactly one primary', () => {
    const ranked = rankContacts(
      [
        { email: 'hello@acme.com', sourceUrl: 'https://acme.com/contact', sourceType: 'company_contact_page' },
        { email: 'sales@acme.com', sourceUrl: 'https://acme.com/contact', sourceType: 'company_contact_page' },
      ],
      'https://acme.com',
    )
    expect(ranked.filter((contact) => contact.isPrimary)).toHaveLength(1)
  })

  it('caps how many contacts one lead can hold', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      email: `person${index}@acme.com`,
      sourceUrl: 'https://acme.com/team',
      sourceType: 'company_team_page',
    }))
    expect(rankContacts(many, 'https://acme.com').length).toBeLessThanOrEqual(5)
  })
})

describe('selectContacts', () => {
  it('lets what the company publishes today outrank a directory listing', () => {
    const selected = selectContacts({
      websiteUrl: 'https://acme.com',
      extractedEmails: [{ email: 'hello@acme.com', sourceUrl: 'https://acme.com/contact', sourceType: 'company_contact_page' }],
      sourceRecordEmails: [{ email: 'old@acme.com', sourceUrl: 'https://directory.example/acme', sourceType: 'source_record' }],
    })
    expect(selected[0].email).toBe('hello@acme.com')
  })
})

describe('checkSyntax', () => {
  it('accepts ordinary business addresses', () => {
    expect(checkSyntax('hello@acme.com').valid).toBe(true)
    expect(checkSyntax('first.last+tag@sub.acme.co.uk').valid).toBe(true)
  })

  it('normalizes case', () => {
    expect(checkSyntax('Hello@Acme.COM').email).toBe('hello@acme.com')
  })

  it('rejects the shapes that never appear on a contact page', () => {
    // An unqualified domain is rejected by normalizeEmail before the
    // label checks run, so the reason is 'unparseable' rather than
    // 'domain_not_qualified'. Both are rejections; only the code differs.
    expect(checkSyntax('hello@acme').valid).toBe(false)
    expect(checkSyntax('hello..world@acme.com').reason).toBe('consecutive_dots')
    expect(checkSyntax('.hello@acme.com').reason).toBe('local_part_characters')
    expect(checkSyntax('hello@acme.123').reason).toBe('tld')
    expect(checkSyntax(`${'a'.repeat(65)}@acme.com`).reason).toBe('local_part_length')
    expect(checkSyntax('hello@-acme.com').reason).toBe('domain_labels')
    expect(checkSyntax('').valid).toBe(false)
  })
})

describe('domainMatchesCompany', () => {
  it('matches the company domain and its subdomains', () => {
    expect(domainMatchesCompany('hello@acme.com', 'acme.com')).toBe(true)
    expect(domainMatchesCompany('hello@mail.acme.com', 'acme.com')).toBe(true)
  })

  it('does not match a lookalike domain', () => {
    expect(domainMatchesCompany('hello@notacme.com', 'acme.com')).toBe(false)
    expect(domainMatchesCompany('hello@acme.com.evil.net', 'acme.com')).toBe(false)
  })
})

describe('lookupMx', () => {
  it('reports MX records as present', async () => {
    const result = await lookupMx('acme.com', {
      fetchImpl: async () => dnsResponse({ Status: 0, Answer: [{ type: 15, data: '10 mail.acme.com.' }] }),
    })

    expect(result.present).toBe(true)
    expect(result.records).toHaveLength(1)
  })

  it('ignores CNAMEs in the answer section', async () => {
    const result = await lookupMx('acme.com', {
      fetchImpl: async () =>
        dnsResponse({ Status: 0, Answer: [{ type: 5, data: 'alias.acme.com.' }, { type: 15, data: '10 mx.acme.com.' }] }),
    })
    expect(result.records).toEqual(['10 mx.acme.com.'])
  })

  it('reports a domain with no MX records', async () => {
    const result = await lookupMx('acme.com', { fetchImpl: async () => dnsResponse({ Status: 0, Answer: [] }) })
    expect(result.present).toBe(false)
    expect(result.reason).toBe('no_mx_records')
  })

  it('reads a null MX as accepting no mail, not as having MX', async () => {
    const result = await lookupMx('acme.com', {
      fetchImpl: async () => dnsResponse({ Status: 0, Answer: [{ type: 15, data: '0 .' }] }),
    })
    expect(result.present).toBe(false)
    expect(result.reason).toBe('null_mx')
  })

  it('treats NXDOMAIN as a real negative answer', async () => {
    const result = await lookupMx('nope.invalid', { fetchImpl: async () => dnsResponse({ Status: 3 }) })
    expect(result.present).toBe(false)
    expect(result.reason).toBe('nxdomain')
  })

  it('returns indeterminate — not false — when the resolver fails', async () => {
    // The distinction that matters: a resolver blip must not take a good lead
    // out of the pipeline.
    const timedOut = await lookupMx('acme.com', {
      fetchImpl: async () => {
        throw new Error('network')
      },
    })
    expect(timedOut.present).toBeNull()

    const serverError = await lookupMx('acme.com', { fetchImpl: async () => new Response('', { status: 500 }) })
    expect(serverError.present).toBeNull()

    const badStatus = await lookupMx('acme.com', { fetchImpl: async () => dnsResponse({ Status: 2 }) })
    expect(badStatus.present).toBeNull()
  })
})

describe('validateContact', () => {
  it('runs every check for a good address', async () => {
    const result = await validateContact('hello@acme.com', {
      companyDomain: 'acme.com',
      fetchImpl: async () => dnsResponse({ Status: 0, Answer: [{ type: 15, data: '10 mx.acme.com.' }] }),
    })

    expect(result).toMatchObject({
      email: 'hello@acme.com',
      syntaxValid: true,
      domainMatchesCompany: true,
      mxPresent: true,
    })
  })

  it('skips the network call when syntax already failed', async () => {
    const fetchImpl = vi.fn()
    const result = await validateContact('not-an-email', { fetchImpl })

    expect(result.syntaxValid).toBe(false)
    expect(result.mxPresent).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('can skip the MX lookup for batch re-validation', async () => {
    const fetchImpl = vi.fn()
    await validateContact('hello@acme.com', { checkMx: false, fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('describeMxState', () => {
  it('never calls an address verified', () => {
    expect(describeMxState(true)).not.toMatch(/verified/i)
    expect(describeMxState(true)).toMatch(/not a mailbox check/i)
    expect(describeMxState(false)).toMatch(/no MX/i)
    expect(describeMxState(null)).toBe('Not checked')
  })
})
