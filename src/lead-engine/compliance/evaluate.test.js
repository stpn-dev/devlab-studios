import { describe, expect, it } from 'vitest'
import { COUNTRY_PROFILES } from './countryProfiles.js'
import { evaluateCompliance, isReadyForOutreachReview } from './evaluate.js'
import { buildUnsubscribeInstruction } from './optOut.js'

const IDENTITY = Object.freeze({
  legalName: 'DevLab Studios',
  senderName: 'Stephen',
  senderEmail: 'hello@devlabstudios.com',
  postalAddress: '100 Congress Ave, Suite 200',
  city: 'Austin',
  region: 'TX',
  postalCode: '78701',
  countryCode: 'US',
})

const CONTACT = Object.freeze({
  sourceUrl: 'https://acme-properties.com/contact',
  sourceType: 'company_contact_page',
  publishedPublicly: true,
})

const REVIEW = Object.freeze({
  legalBasis: 'legitimate interest in business-to-business outreach',
  legalBasisReference: 'LIA-2026-04',
  reviewedBy: 'stephen@aibusinessgrowthfirm.com',
})

const NOT_SUPPRESSED = Object.freeze({ suppressed: false, entry: null })

function usInput(overrides = {}) {
  return {
    countryCode: 'US',
    businessIdentity: IDENTITY,
    contact: CONTACT,
    lead: { stage: 'READY_FOR_REVIEW' },
    suppression: NOT_SUPPRESSED,
    ...overrides,
  }
}

function phInput(overrides = {}) {
  return {
    countryCode: 'PH',
    businessIdentity: IDENTITY,
    contact: CONTACT,
    lead: { stage: 'READY_FOR_REVIEW' },
    suppression: NOT_SUPPRESSED,
    review: REVIEW,
    ...overrides,
  }
}

function failedKeys(evaluation) {
  return evaluation.checks.filter((check) => !check.passed).map((check) => check.key)
}

describe('evaluateCompliance — US profile', () => {
  it('passes a fully configured US lead', () => {
    const evaluation = evaluateCompliance(usInput())

    expect(evaluation.profileKey).toBe('us-can-spam-operational')
    expect(evaluation.state).toBe('passed')
    expect(evaluation.blockingReasons).toEqual([])
    expect(evaluation.checks).toHaveLength(COUNTRY_PROFILES.US.checks.length)
  })

  it('holds the lead for human review when the business postal address is unconfigured', () => {
    const evaluation = evaluateCompliance(
      usInput({ businessIdentity: { ...IDENTITY, postalAddress: '', city: '' } }),
    )

    expect(evaluation.state).toBe('needs_human_review')
    expect(failedKeys(evaluation)).toEqual(['postal_address_configured'])
    expect(evaluation.blockingReasons[0]).toMatch(/postalAddress, city/)
    expect(isReadyForOutreachReview(evaluation)).toBe(false)
  })

  it('holds the lead when the sender identity is unconfigured', () => {
    const evaluation = evaluateCompliance(usInput({ businessIdentity: { ...IDENTITY, senderEmail: '' } }))

    expect(evaluation.state).toBe('needs_human_review')
    // Losing the sender address also removes the opt-out route, and the
    // evaluation must say both rather than only the first thing it noticed.
    expect(failedKeys(evaluation)).toEqual(['sender_identity_configured', 'opt_out_mechanism_present'])
  })

  it('holds the lead when the contact has no recorded provenance', () => {
    expect(evaluateCompliance(usInput({ contact: null })).state).toBe('needs_human_review')
    expect(
      failedKeys(evaluateCompliance(usInput({ contact: { ...CONTACT, publishedPublicly: false } }))),
    ).toEqual(['contact_provenance_recorded'])
  })

  it('holds a draft that lost its opt-out instruction', () => {
    const evaluation = evaluateCompliance(
      usInput({ lead: { stage: 'READY_FOR_REVIEW', draftBodyText: 'Hi there, noticed your intake form.' } }),
    )

    expect(evaluation.state).toBe('needs_human_review')
    expect(failedKeys(evaluation)).toEqual(['opt_out_mechanism_present'])
  })

  it('passes a draft that carries the opt-out instruction', () => {
    const draftBodyText = `Hi there, noticed your intake form.\n\n${buildUnsubscribeInstruction(IDENTITY)}`
    const evaluation = evaluateCompliance(usInput({ lead: { stage: 'READY_FOR_REVIEW', draftBodyText } }))

    expect(evaluation.state).toBe('passed')
  })
})

describe('evaluateCompliance — PH profile', () => {
  it('passes a PH lead with a recorded legal basis and privacy review', () => {
    const evaluation = evaluateCompliance(phInput())

    expect(evaluation.profileKey).toBe('ph-dpa-operational')
    expect(evaluation.state).toBe('passed')
  })

  it('requires a recorded legal basis', () => {
    const evaluation = evaluateCompliance(phInput({ review: { ...REVIEW, legalBasis: '' } }))

    expect(evaluation.state).toBe('needs_human_review')
    expect(failedKeys(evaluation)).toEqual(['legal_basis_recorded'])
  })

  it('requires a named reviewer and a privacy assessment reference', () => {
    expect(failedKeys(evaluateCompliance(phInput({ review: { ...REVIEW, reviewedBy: '' } }))))
      .toEqual(['privacy_review_recorded'])
    expect(failedKeys(evaluateCompliance(phInput({ review: null }))))
      .toEqual(['legal_basis_recorded', 'privacy_review_recorded'])
  })

  it('does not require a US postal address to be configured', () => {
    const evaluation = evaluateCompliance(phInput({ businessIdentity: { ...IDENTITY, postalAddress: '' } }))
    expect(evaluation.state).toBe('passed')
  })
})

describe('evaluateCompliance — hard boundaries', () => {
  it('blocks a suppressed recipient under every profile', () => {
    const suppression = { suppressed: true, entry: { scope: 'email', reason: 'unsubscribe' } }

    for (const input of [usInput({ suppression }), phInput({ suppression }), { countryCode: 'ZZ', suppression }]) {
      const evaluation = evaluateCompliance(input)
      expect(evaluation.state, evaluation.profileKey).toBe('blocked')
      expect(evaluation.blockingReasons.join(' ')).toMatch(/unsubscribe/)
    }
  })

  it('blocks rather than merely holding when a configuration check also failed', () => {
    const evaluation = evaluateCompliance(usInput({
      businessIdentity: {},
      suppression: { suppressed: true, entry: { scope: 'domain', reason: 'complaint' } },
    }))

    expect(evaluation.state).toBe('blocked')
    // The reasons narrow to the boundary that actually stopped the lead, so the
    // screen does not bury "suppressed" under settings warnings.
    expect(evaluation.blockingReasons).toHaveLength(1)
    expect(evaluation.blockingReasons[0]).toMatch(/Suppressed by domain/)
  })

  it('blocks when suppression was never checked, rather than assuming it was clean', () => {
    const evaluation = evaluateCompliance(usInput({ suppression: null }))

    expect(evaluation.state).toBe('blocked')
    expect(evaluation.blockingReasons[0]).toMatch(/not checked/)
  })

  it('blocks a lead marked do-not-contact', () => {
    for (const stage of ['DO_NOT_CONTACT', 'UNSUBSCRIBED', 'NO_CONTACT']) {
      expect(evaluateCompliance(usInput({ lead: { stage } })).state, stage).toBe('blocked')
    }
    expect(evaluateCompliance(usInput({ lead: null })).state).toBe('passed')
  })
})

describe('evaluateCompliance — unconfigured markets', () => {
  it('routes an unknown country to human review instead of passing it', () => {
    const evaluation = evaluateCompliance({
      countryCode: 'ZZ',
      businessIdentity: IDENTITY,
      contact: CONTACT,
      lead: { stage: 'READY_FOR_REVIEW' },
      suppression: NOT_SUPPRESSED,
    })

    expect(evaluation.profileKey).toBe('default-human-review')
    expect(evaluation.countryCode).toBe('ZZ')
    expect(evaluation.state).toBe('needs_human_review')
    expect(failedKeys(evaluation)).toEqual(['market_profile_configured'])
  })

  it('routes a missing country code to human review too', () => {
    expect(evaluateCompliance({ suppression: NOT_SUPPRESSED }).state).toBe('needs_human_review')
    expect(evaluateCompliance().state).toBe('blocked')
  })
})

describe('evaluateCompliance — invariants', () => {
  it('never returns waived, because only a human can waive', () => {
    const inputs = [usInput(), phInput(), { countryCode: 'ZZ' }, {}, usInput({ suppression: { suppressed: true } })]

    for (const input of inputs) {
      expect(['passed', 'blocked', 'needs_human_review']).toContain(evaluateCompliance(input).state)
    }
  })

  it('has an evaluator for every check in every configured profile', () => {
    for (const countryCode of [...Object.keys(COUNTRY_PROFILES), 'ZZ']) {
      const evaluation = evaluateCompliance({ countryCode, suppression: NOT_SUPPRESSED })
      expect(evaluation.checks.every((check) => typeof check.detail === 'string' && check.detail.length > 0)).toBe(true)
    }
  })

  it('records every check, passed or not, for the audit trail', () => {
    const evaluation = evaluateCompliance(usInput())

    for (const check of evaluation.checks) {
      expect(Object.keys(check).sort()).toEqual(['detail', 'key', 'passed', 'required'])
    }
  })
})

describe('isReadyForOutreachReview', () => {
  it('admits a passing evaluation', () => {
    expect(isReadyForOutreachReview(evaluateCompliance(usInput()))).toBe(true)
  })

  it('admits a stored review a human waived, and nothing else', () => {
    expect(isReadyForOutreachReview({ state: 'waived' })).toBe(true)
    for (const state of ['pending', 'blocked', 'needs_human_review', 'unknown']) {
      expect(isReadyForOutreachReview({ state }), state).toBe(false)
    }
  })

  it('treats a missing review as not ready', () => {
    expect(isReadyForOutreachReview(null)).toBe(false)
    expect(isReadyForOutreachReview(undefined)).toBe(false)
    expect(isReadyForOutreachReview({})).toBe(false)
  })
})
