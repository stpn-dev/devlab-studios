import { describe, it, expect } from 'vitest'
import {
  collapseWhitespace,
  computeIdempotencyKey,
  deriveSubject,
  normalizeEmail,
  normalizeInquiry,
  normalizeUrl,
} from './normalize'

const baseInput = {
  inquiryType: 'business_system',
  fullName: '  Dana   Reyes  ',
  email: '  Dana@ACME.co ',
  message: '  Follow-up depends on someone remembering.  ',
  company: '  Acme   Co ',
  website: 'acme.co',
  phone: '',
  currentWorkflow: '',
  desiredOutcome: '',
  currentTools: '',
  teamSize: '',
  timeline: 'within_month',
  budgetRange: '',
  volume: '',
  preferredContact: 'email',
  solutionInterest: '',
  roleTitle: '',
  employmentType: '',
  workArrangement: '',
  locationRequirement: '',
  jobPostingUrl: '',
  hiringTimeline: '',
}

describe('field normalization', () => {
  it('lowercases and trims an email', () => {
    expect(normalizeEmail('  Dana@ACME.co ')).toBe('dana@acme.co')
  })

  it('adds the missing scheme to a bare domain', () => {
    expect(normalizeUrl('acme.co')).toBe('https://acme.co')
  })

  it('leaves an existing scheme alone', () => {
    expect(normalizeUrl('http://acme.co')).toBe('http://acme.co')
    expect(normalizeUrl('https://acme.co/path')).toBe('https://acme.co/path')
  })

  it('returns an empty string for empty input rather than "https://"', () => {
    expect(normalizeUrl('')).toBe('')
    expect(normalizeUrl('   ')).toBe('')
  })

  it('collapses runs of spaces without touching newlines', () => {
    expect(collapseWhitespace('  a    b  ')).toBe('a b')
    expect(collapseWhitespace('a\n\nb')).toBe('a\n\nb')
  })
})

describe('deriveSubject', () => {
  it('combines the inquiry type label with the company', () => {
    expect(deriveSubject('business_system', 'Acme Co')).toContain('Acme Co')
    expect(deriveSubject('business_system', 'Acme Co')).toContain('Business system')
  })

  it('falls back to the label alone when there is no company', () => {
    expect(deriveSubject('general', '')).toBe('General inquiry')
  })

  it('caps the length so a pasted company name cannot blow up the subject line', () => {
    expect(deriveSubject('business_system', 'x'.repeat(500)).length).toBeLessThanOrEqual(180)
  })
})

describe('normalizeInquiry', () => {
  it('produces a canonical record', () => {
    const result = normalizeInquiry(baseInput, 'business-inquiry-form')
    expect(result.name).toBe('Dana Reyes')
    expect(result.email).toBe('dana@acme.co')
    expect(result.website).toBe('https://acme.co')
    expect(result.message).toBe('Follow-up depends on someone remembering.')
    expect(result.source).toBe('business-inquiry-form')
  })

  it('derives a subject when none is supplied', () => {
    const result = normalizeInquiry(baseInput, 'form')
    expect(result.subject).toBe('Business system or automation — Acme Co')
  })

  it('honours an explicit subject override (the legacy contact endpoint)', () => {
    const result = normalizeInquiry({ ...baseInput, subjectOverride: 'Pickleball beta tester request' }, 'form')
    expect(result.subject).toBe('Pickleball beta tester request')
  })

  it('ignores a blank override rather than producing an empty subject', () => {
    const result = normalizeInquiry({ ...baseInput, subjectOverride: '   ' }, 'form')
    expect(result.subject).toBe('Business system or automation — Acme Co')
  })
})

describe('computeIdempotencyKey', () => {
  const parts = { inquiryType: 'business_system', email: 'dana@acme.co', message: 'Same message.' }
  const now = 1_700_000_000_000

  it('produces the same key for an identical resubmission in the same window', async () => {
    const first = await computeIdempotencyKey(parts, now)
    const second = await computeIdempotencyKey(parts, now + 1000)
    expect(first).toBe(second)
  })

  it('treats a differently-cased email as the same submission', async () => {
    const first = await computeIdempotencyKey(parts, now)
    const second = await computeIdempotencyKey({ ...parts, email: 'DANA@Acme.co' }, now)
    expect(first).toBe(second)
  })

  it('produces a different key once the time bucket rolls over', async () => {
    const first = await computeIdempotencyKey(parts, now)
    const later = await computeIdempotencyKey(parts, now + 11 * 60 * 1000)
    expect(first).not.toBe(later)
  })

  it('produces a different key for a different message', async () => {
    const first = await computeIdempotencyKey(parts, now)
    const other = await computeIdempotencyKey({ ...parts, message: 'Different message.' }, now)
    expect(first).not.toBe(other)
  })

  it('produces a different key for a different inquiry type', async () => {
    const first = await computeIdempotencyKey(parts, now)
    const other = await computeIdempotencyKey({ ...parts, inquiryType: 'general' }, now)
    expect(first).not.toBe(other)
  })

  it('does not collide when field boundaries shift', async () => {
    // Without an explicit separator, ("ab","c") and ("a","bc") would hash the same.
    const left = await computeIdempotencyKey({ inquiryType: 'ab', email: 'c@x.co', message: 'm' }, now)
    const right = await computeIdempotencyKey({ inquiryType: 'a', email: 'bc@x.co', message: 'm' }, now)
    expect(left).not.toBe(right)
  })

  it('returns a hex SHA-256 digest', async () => {
    const key = await computeIdempotencyKey(parts, now)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})
