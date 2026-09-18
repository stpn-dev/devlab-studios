import { describe, expect, it } from 'vitest'
import { classifyPage, extractSignals, isPlausibleBusinessEmail } from './extract.js'

function page(url, html) {
  return { url, finalUrl: url, html, used: true }
}

function keys(result) {
  return new Set(result.signals.map((entry) => entry.signalKey))
}

describe('isPlausibleBusinessEmail', () => {
  it('accepts an ordinary business address', () => {
    expect(isPlausibleBusinessEmail('hello@acme.com', 'acme.com')).toBe(true)
    expect(isPlausibleBusinessEmail('Info@Acme.com', 'acme.com')).toBe(true)
  })

  it('rejects template placeholders that would make a lead look contactable', () => {
    expect(isPlausibleBusinessEmail('you@example.com')).toBe(false)
    expect(isPlausibleBusinessEmail('name@yourdomain.com')).toBe(false)
    expect(isPlausibleBusinessEmail('info@test.com')).toBe(false)
  })

  it('rejects asset filenames that look like addresses', () => {
    expect(isPlausibleBusinessEmail('logo@2x.png')).toBe(false)
  })

  it('rejects Sentry-style instrumentation addresses', () => {
    expect(isPlausibleBusinessEmail('abc@sentry.io')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isPlausibleBusinessEmail('')).toBe(false)
    expect(isPlausibleBusinessEmail('not-an-email')).toBe(false)
  })
})

describe('classifyPage', () => {
  it('names the page role for contact provenance', () => {
    expect(classifyPage('https://acme.com/')).toBe('company_homepage')
    expect(classifyPage('https://acme.com/contact')).toBe('company_contact_page')
    expect(classifyPage('https://acme.com/get-in-touch')).toBe('company_contact_page')
    expect(classifyPage('https://acme.com/about-us')).toBe('company_about_page')
    expect(classifyPage('https://acme.com/our-team')).toBe('company_team_page')
    expect(classifyPage('https://acme.com/blog/x')).toBe('company_other_page')
  })
})

describe('extractSignals', () => {
  it('returns nothing usable when no page was fetched', () => {
    const result = extractSignals({ pages: [{ url: 'https://acme.com/', used: false }], websiteUrl: 'https://acme.com' })
    expect(result.signals).toHaveLength(0)
    expect(result.emails).toHaveLength(0)
  })

  it('records an active website and its canonical domain', () => {
    const result = extractSignals({
      pages: [page('https://acme.com/', '<html><body><p>Acme Properties</p></body></html>')],
      websiteUrl: 'https://acme.com',
    })

    expect(keys(result).has('ACTIVE_WEBSITE')).toBe(true)
    expect(keys(result).has('RESOLVED_CANONICAL_DOMAIN')).toBe(true)
  })

  it('finds a mailto address and prefers it over a prose sighting', () => {
    const result = extractSignals({
      pages: [
        page('https://acme.com/', '<html><body>Write to hello@acme.com</body></html>'),
        page('https://acme.com/contact', '<html><body><a href="mailto:hello@acme.com">Email</a></body></html>'),
      ],
      websiteUrl: 'https://acme.com',
    })

    expect(result.emails).toHaveLength(1)
    expect(result.emails[0].email).toBe('hello@acme.com')
    expect(result.emails[0].fromMailto).toBe(true)
    expect(result.emails[0].sourceType).toBe('company_contact_page')
    expect(keys(result).has('PUBLIC_BUSINESS_EMAIL')).toBe(true)
  })

  it('finds addresses on every page, not just the first', () => {
    // Guards the shared-regex lastIndex bug: a module-level /g pattern reused
    // across pages without resetting silently skips matches after page one.
    const result = extractSignals({
      pages: [
        page('https://acme.com/', '<html><body>one@acme.com</body></html>'),
        page('https://acme.com/about', '<html><body>two@acme.com</body></html>'),
        page('https://acme.com/contact', '<html><body>three@acme.com</body></html>'),
      ],
      websiteUrl: 'https://acme.com',
    })

    expect(result.emails.map((entry) => entry.email).sort()).toEqual([
      'one@acme.com',
      'three@acme.com',
      'two@acme.com',
    ])
  })

  it('does not read addresses or phrases out of inline scripts', () => {
    const html = `<html><body>
      <script>var config = {supportEmail: "widget@vendor.com", cta: "call us today"};</script>
      <p>Acme Properties manages homes.</p>
    </body></html>`
    const result = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })

    expect(result.emails).toHaveLength(0)
    expect(keys(result).has('MANUAL_PHONE_INTAKE')).toBe(false)
  })

  it('detects a booking platform by script host, not by mention', () => {
    const integrated = extractSignals({
      pages: [page('https://acme.com/', '<html><head><script src="https://assets.calendly.com/widget.js"></script></head><body>x</body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(integrated).has('BOOKING_DETECTED')).toBe(true)
    expect(keys(integrated).has('NO_VISIBLE_SCHEDULING')).toBe(false)

    const merelyMentioned = extractSignals({
      pages: [page('https://acme.com/', '<html><body>We are moving away from Calendly soon.</body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(merelyMentioned).has('BOOKING_DETECTED')).toBe(false)
    expect(keys(merelyMentioned).has('NO_VISIBLE_SCHEDULING')).toBe(true)
  })

  it('does not match a lookalike host', () => {
    const result = extractSignals({
      pages: [page('https://acme.com/', '<html><script src="https://notcalendly.com.evil.net/x.js"></script><body>x</body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(result).has('BOOKING_DETECTED')).toBe(false)
  })

  it('detects a chat widget and a CRM', () => {
    const html = `<html><head>
      <script src="https://widget.intercom.io/widget/abc"></script>
      <script src="https://js.hsforms.net/forms/v2.js"></script>
    </head><body>x</body></html>`
    const result = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })

    expect(keys(result).has('CHAT_WIDGET_DETECTED')).toBe(true)
    expect(keys(result).has('CRM_DETECTED')).toBe(true)
    expect(result.technologies).toContain('Intercom')
  })

  it('groups manual-workflow phrasings by kind rather than counting phrases', () => {
    const html = `<html><body>
      <p>Call us today. Give us a call. Call our office to discuss.</p>
    </body></html>`
    const result = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })

    expect(keys(result).has('MANUAL_WORKFLOW_LANGUAGE')).toBe(true)
    // Three phrasings of the same thing is ONE manual workflow.
    expect(keys(result).has('MULTIPLE_MANUAL_WORKFLOWS')).toBe(false)
  })

  it('reports more than one manual workflow across kinds and pages', () => {
    const result = extractSignals({
      pages: [
        page('https://acme.com/', '<html><body>Call our office to get started.</body></html>'),
        page('https://acme.com/owners', '<html><body>Download the form, print and sign it.</body></html>'),
      ],
      websiteUrl: 'https://acme.com',
    })

    expect(keys(result).has('MULTIPLE_MANUAL_WORKFLOWS')).toBe(true)
  })

  it('attaches an evidence excerpt to a manual-language signal', () => {
    const result = extractSignals({
      pages: [page('https://acme.com/', '<html><body>To begin, please call our office during business hours.</body></html>')],
      websiteUrl: 'https://acme.com',
    })

    const entry = result.signals.find((item) => item.signalKey === 'MANUAL_PHONE_INTAKE')
    expect(entry.evidence).toContain('call our office')
    expect(entry.evidence.length).toBeLessThanOrEqual(240)
  })

  it('distinguishes a contact form from a search box', () => {
    const contact = extractSignals({
      pages: [page('https://acme.com/contact', '<html><body><form action="/send"><textarea name="msg"></textarea></form></body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(contact).has('CONTACT_FORM')).toBe(true)

    const search = extractSignals({
      pages: [page('https://acme.com/', '<html><body><form action="/search"><input name="q"></form></body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(search).has('CONTACT_FORM')).toBe(false)
    expect(keys(search).has('FORM_PRESENT_NOT_CONTACT')).toBe(true)
  })

  it('reads structured business data', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"LocalBusiness","name":"Acme","email":"info@acme.com","telephone":"+1 512 555 0100"}
    </script></head><body>x</body></html>`
    const result = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })

    expect(keys(result).has('STRUCTURED_DATA_PRESENT')).toBe(true)
    expect(result.emails.some((entry) => entry.email === 'info@acme.com')).toBe(true)
    expect(result.phones.length).toBeGreaterThan(0)
  })

  it('survives malformed JSON-LD', () => {
    const html = '<html><head><script type="application/ld+json">{bad json,}</script></head><body>ok</body></html>'
    expect(() => extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })).not.toThrow()
  })

  it('detects portals and application forms', () => {
    const html = '<html><body><a href="/portal">Owner Portal</a><p>Rental application available online.</p></body></html>'
    const result = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })

    expect(keys(result).has('OWNER_PORTAL')).toBe(true)
    expect(keys(result).has('CLIENT_PORTAL')).toBe(true)
    expect(keys(result).has('APPLICATION_FORM')).toBe(true)
  })

  it('treats a linked PDF as a workflow only alongside form language', () => {
    const withForm = extractSignals({
      pages: [page('https://acme.com/', '<html><body><a href="/lease.pdf">Lease</a><p>Complete the application form.</p></body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(withForm).has('PDF_WORKFLOW')).toBe(true)

    const brochureOnly = extractSignals({
      pages: [page('https://acme.com/', '<html><body><a href="/brochure.pdf">Our brochure</a></body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(keys(brochureOnly).has('PDF_WORKFLOW')).toBe(false)
  })

  it('identifies the site platform', () => {
    const result = extractSignals({
      pages: [page('https://acme.com/', '<html><head><meta name="generator" content="WordPress 6.4"></head><body>x</body></html>')],
      websiteUrl: 'https://acme.com',
    })
    expect(result.technologies).toContain('WordPress')
  })

  it('notices multiple audiences', () => {
    const html = '<html><body><p>Services for owners, tenants and investors.</p></body></html>'
    const result = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })
    expect(keys(result).has('MULTIPLE_AUDIENCES')).toBe(true)
  })

  it('applies campaign vocabulary rather than built-in vertical terms', () => {
    const html = '<html><body><p>We are a property management company serving Austin.</p></body></html>'

    const matched = extractSignals({
      pages: [page('https://acme.com/', html)],
      websiteUrl: 'https://acme.com',
      campaignConfig: { targetIndustries: ['property management'] },
    })
    expect(keys(matched).has('TARGET_INDUSTRY')).toBe(true)

    const unconfigured = extractSignals({ pages: [page('https://acme.com/', html)], websiteUrl: 'https://acme.com' })
    expect(keys(unconfigured).has('TARGET_INDUSTRY')).toBe(false)
  })

  it('flags a campaign disqualifying keyword', () => {
    const result = extractSignals({
      pages: [page('https://acme.com/', '<html><body>We are a staffing agency.</body></html>')],
      websiteUrl: 'https://acme.com',
      campaignConfig: { disqualifyingKeywords: ['staffing agency'] },
    })
    expect(keys(result).has('DISQUALIFYING_KEYWORD')).toBe(true)
  })

  it('emits absence signals from the whole-site view', () => {
    const result = extractSignals({
      pages: [
        page('https://acme.com/', '<html><body>Home</body></html>'),
        page('https://acme.com/contact', '<html><head><script src="https://calendly.com/x.js"></script></head><body>Contact</body></html>'),
      ],
      websiteUrl: 'https://acme.com',
    })

    // Booking was found on a secondary page, so the site does not get the
    // "no scheduling" signal.
    expect(keys(result).has('NO_VISIBLE_SCHEDULING')).toBe(false)
  })
})
