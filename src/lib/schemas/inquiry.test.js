import { describe, it, expect } from 'vitest'
import { inquiryRequestSchema, leadMagnetRequestSchema } from './inquiry'

/**
 * These tests pin the SERVER-side contract. The React form imports the same
 * schema, so a change that breaks one breaks both — which is the point: the
 * form and the endpoint cannot drift apart without a test failing.
 */

const validConsent = { granted: true, consentTextVersion: '2026-09-17', privacyPolicyVersion: '2026-09-17' }

function businessPayload(overrides = {}) {
  return {
    inquiryType: 'business_system',
    fullName: 'Dana Reyes',
    email: 'dana@acme.co',
    message: 'Inquiries land in a shared inbox and nobody owns the follow-up step.',
    company: 'Acme Co',
    desiredOutcome: 'Every inquiry gets an owner and a reply within the day.',
    timeline: 'within_month',
    consent: validConsent,
    ...overrides,
  }
}

describe('inquiryRequestSchema — shared fields', () => {
  it('accepts a minimal general inquiry', () => {
    const result = inquiryRequestSchema.safeParse({
      inquiryType: 'general',
      fullName: 'Sam Cruz',
      email: 'sam@example.com',
      message: 'A quick question about scope.',
      consent: validConsent,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a malformed email', () => {
    const result = inquiryRequestSchema.safeParse({
      inquiryType: 'general',
      fullName: 'Sam Cruz',
      email: 'not-an-email',
      message: 'Hello.',
      consent: validConsent,
    })
    expect(result.success).toBe(false)
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'email')).toBe(true)
  })

  it('rejects a submission without consent', () => {
    const result = inquiryRequestSchema.safeParse(
      businessPayload({ consent: { ...validConsent, granted: false } }),
    )
    expect(result.success).toBe(false)
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'consent.granted')).toBe(true)
  })

  it('rejects an over-long message rather than truncating it', () => {
    const result = inquiryRequestSchema.safeParse(businessPayload({ message: 'x'.repeat(5001) }))
    expect(result.success).toBe(false)
  })

  it('defaults optional selects to an empty string rather than failing', () => {
    const result = inquiryRequestSchema.safeParse(businessPayload())
    expect(result.success).toBe(true)
    expect(result.data.teamSize).toBe('')
    expect(result.data.budgetRange).toBe('')
  })

  it('defaults attribution to a fully-populated empty shape', () => {
    const result = inquiryRequestSchema.safeParse(businessPayload())
    expect(result.success).toBe(true)
    expect(result.data.attribution.utmSource).toBe('')
    expect(result.data.attribution.formId).toBe('')
  })

  it('accepts a bare domain for website and rejects nonsense', () => {
    expect(inquiryRequestSchema.safeParse(businessPayload({ website: 'acme.co' })).success).toBe(true)
    expect(inquiryRequestSchema.safeParse(businessPayload({ website: 'https://acme.co/path' })).success).toBe(true)
    expect(inquiryRequestSchema.safeParse(businessPayload({ website: 'not a url at all' })).success).toBe(false)
  })
})

describe('inquiryRequestSchema — conditional business fields', () => {
  it('requires company, desired outcome, and timeline for a business system inquiry', () => {
    const result = inquiryRequestSchema.safeParse({
      inquiryType: 'business_system',
      fullName: 'Dana Reyes',
      email: 'dana@acme.co',
      message: 'Something is slow.',
      consent: validConsent,
    })
    expect(result.success).toBe(false)
    const paths = result.error.issues.map((issue) => issue.path.join('.'))
    expect(paths).toContain('company')
    expect(paths).toContain('desiredOutcome')
    expect(paths).toContain('timeline')
  })

  it('does NOT require those fields for a general inquiry', () => {
    const result = inquiryRequestSchema.safeParse({
      inquiryType: 'general',
      fullName: 'Dana Reyes',
      email: 'dana@acme.co',
      message: 'Just a question.',
      consent: validConsent,
    })
    expect(result.success).toBe(true)
  })

  it('applies the business rules to workflow_audit and software_project too', () => {
    for (const inquiryType of ['workflow_audit', 'software_project']) {
      const result = inquiryRequestSchema.safeParse({
        inquiryType,
        fullName: 'Dana Reyes',
        email: 'dana@acme.co',
        message: 'Something is slow.',
        consent: validConsent,
      })
      expect(result.success, inquiryType).toBe(false)
    }
  })
})

describe('inquiryRequestSchema — conditional employment fields', () => {
  it('requires role title and employment type for an employment inquiry', () => {
    const result = inquiryRequestSchema.safeParse({
      inquiryType: 'employment_opportunity',
      fullName: 'Alex Tan',
      email: 'alex@studio.io',
      message: 'We are hiring a backend engineer.',
      company: 'Studio.io',
      consent: validConsent,
    })
    expect(result.success).toBe(false)
    const paths = result.error.issues.map((issue) => issue.path.join('.'))
    expect(paths).toContain('roleTitle')
    expect(paths).toContain('employmentType')
  })

  it('does NOT require business qualification fields for an employment inquiry', () => {
    const result = inquiryRequestSchema.safeParse({
      inquiryType: 'employment_opportunity',
      fullName: 'Alex Tan',
      email: 'alex@studio.io',
      message: 'We are hiring a backend engineer.',
      company: 'Studio.io',
      roleTitle: 'Backend Engineer',
      employmentType: 'full_time',
      consent: validConsent,
    })
    expect(result.success).toBe(true)
    // The whole point of the separate flow: no timeline, no budget, no outcome.
    expect(result.data.timeline).toBe('')
    expect(result.data.budgetRange).toBe('')
    expect(result.data.desiredOutcome).toBe('')
  })
})

describe('attribution bounds', () => {
  it('rejects an oversized attribution field instead of storing it', () => {
    const result = inquiryRequestSchema.safeParse(
      businessPayload({ attribution: { utmCampaign: 'x'.repeat(201) } }),
    )
    expect(result.success).toBe(false)
  })

  it('silently ignores an unknown attribution key rather than passing it through', () => {
    const result = inquiryRequestSchema.safeParse(
      businessPayload({ attribution: { utmSource: 'newsletter', injected: 'nope' } }),
    )
    expect(result.success).toBe(true)
    expect(result.data.attribution.utmSource).toBe('newsletter')
    expect('injected' in result.data.attribution).toBe(false)
  })
})

describe('leadMagnetRequestSchema', () => {
  it('accepts name, email, offer, and consent', () => {
    const result = leadMagnetRequestSchema.safeParse({
      fullName: 'Jo Lim',
      email: 'jo@example.com',
      offerId: 'lead-intake-checklist',
      consent: validConsent,
    })
    expect(result.success).toBe(true)
  })

  it('requires an offer id', () => {
    const result = leadMagnetRequestSchema.safeParse({
      fullName: 'Jo Lim',
      email: 'jo@example.com',
      offerId: '',
      consent: validConsent,
    })
    expect(result.success).toBe(false)
  })
})
