import type { InquiryRequest, InquiryType } from '../schemas/inquiry'
import { INQUIRY_TYPE_LABELS } from '../schemas/inquiry'

/**
 * Normalization that runs AFTER Zod validation and BEFORE persistence, so
 * everything stored is in one canonical shape: emails lowercased, URLs given
 * a scheme, whitespace collapsed. Kept out of the schema itself because Zod
 * runs on the client too, and the client must never be the thing that decides
 * what gets written.
 */

export function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase()
}

/** Adds the missing scheme visitors routinely omit. Returns '' for empty input. */
export function normalizeUrl(value: string): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function collapseWhitespace(value: string): string {
  return String(value || '').trim().replace(/[ \t]+/g, ' ')
}

/**
 * A human-readable subject for the notification email and the admin list.
 * Derived server-side rather than asked for, so the visitor never has to
 * invent one and it cannot be used as an injection surface.
 */
export function deriveSubject(inquiryType: InquiryType, company: string): string {
  const label = INQUIRY_TYPE_LABELS[inquiryType] || 'Inquiry'
  const org = collapseWhitespace(company)
  return org ? `${label} — ${org}`.slice(0, 180) : label.slice(0, 180)
}

export interface NormalizedInquiry {
  inquiryType: InquiryType
  name: string
  email: string
  subject: string
  message: string
  company: string
  website: string
  phone: string
  currentWorkflow: string
  desiredOutcome: string
  currentTools: string
  teamSize: string
  timeline: string
  budgetRange: string
  volume: string
  preferredContact: string
  solutionInterest: string
  roleTitle: string
  employmentType: string
  workArrangement: string
  locationRequirement: string
  jobPostingUrl: string
  hiringTimeline: string
  source: string
}

export function normalizeInquiry(
  input: InquiryRequest & { subjectOverride?: string },
  source: string,
): NormalizedInquiry {
  // `subjectOverride` exists for the legacy contact endpoint, whose visitors
  // genuinely wrote their own subject line. Everything else derives one.
  const overrideSubject = collapseWhitespace(input.subjectOverride || '').slice(0, 180)
  return {
    inquiryType: input.inquiryType,
    name: collapseWhitespace(input.fullName),
    email: normalizeEmail(input.email),
    subject: overrideSubject || deriveSubject(input.inquiryType, input.company),
    message: String(input.message || '').trim(),
    company: collapseWhitespace(input.company),
    website: normalizeUrl(input.website),
    phone: collapseWhitespace(input.phone),
    currentWorkflow: String(input.currentWorkflow || '').trim(),
    desiredOutcome: String(input.desiredOutcome || '').trim(),
    currentTools: collapseWhitespace(input.currentTools),
    teamSize: input.teamSize,
    timeline: input.timeline,
    budgetRange: input.budgetRange,
    volume: collapseWhitespace(input.volume),
    preferredContact: input.preferredContact,
    solutionInterest: collapseWhitespace(input.solutionInterest),
    roleTitle: collapseWhitespace(input.roleTitle),
    employmentType: input.employmentType,
    workArrangement: input.workArrangement,
    locationRequirement: collapseWhitespace(input.locationRequirement),
    jobPostingUrl: normalizeUrl(input.jobPostingUrl),
    hiringTimeline: input.hiringTimeline,
    source,
  }
}

/**
 * ASCII Unit Separator. Built with fromCharCode rather than written inline so
 * the control character never has to survive a file round-trip. It cannot
 * appear in any validated field, which is what stops ("ab", "c") and
 * ("a", "bc") from hashing to the same key.
 */
const FIELD_SEPARATOR = String.fromCharCode(31)

/**
 * Server-computed idempotency fingerprint.
 *
 * Deliberately NOT client-supplied: a client-chosen key lets a caller either
 * collide with someone else's inquiry or bypass dedupe entirely by rotating
 * it. Derived from (type, email, message) plus a coarse time bucket so a
 * genuine follow-up sent an hour later is still accepted as a new inquiry
 * while a double-click, an impatient retry, or a replayed request is not.
 */
export async function computeIdempotencyKey(
  parts: { inquiryType: string; email: string; message: string },
  now: number = Date.now(),
  bucketMs: number = 10 * 60 * 1000,
): Promise<string> {
  const bucket = Math.floor(now / bucketMs)
  const payload = [parts.inquiryType, normalizeEmail(parts.email), String(parts.message || '').trim(), bucket].join(
    FIELD_SEPARATOR,
  )
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
