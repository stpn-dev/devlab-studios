import { describe, expect, it } from 'vitest'
import {
  COUNTRY_PROFILES,
  DEFAULT_COUNTRY_PROFILE,
  HARD_BOUNDARY_CHECK_KEYS,
  getCountryProfile,
} from './countryProfiles.js'

function checkKeys(profile) {
  return profile.checks.map((check) => check.key)
}

describe('COUNTRY_PROFILES', () => {
  it('describes the US market with its operational checks', () => {
    const profile = COUNTRY_PROFILES.US

    expect(profile.key).toBe('us-can-spam-operational')
    expect(profile.countryCode).toBe('US')
    expect(checkKeys(profile)).toEqual([
      'sender_identity_configured',
      'postal_address_configured',
      'contact_provenance_recorded',
      'opt_out_mechanism_present',
      'recipient_not_suppressed',
      'not_do_not_contact',
    ])
  })

  it('describes the PH market with its operational checks', () => {
    const profile = COUNTRY_PROFILES.PH

    expect(profile.key).toBe('ph-dpa-operational')
    expect(checkKeys(profile)).toEqual([
      'legal_basis_recorded',
      'privacy_review_recorded',
      'contact_provenance_recorded',
      'objection_handling_available',
      'recipient_not_suppressed',
      'not_do_not_contact',
    ])
  })

  it('carries both hard boundaries in every profile, including the fallback', () => {
    const profiles = [...Object.values(COUNTRY_PROFILES), DEFAULT_COUNTRY_PROFILE]

    for (const profile of profiles) {
      for (const boundary of HARD_BOUNDARY_CHECK_KEYS) {
        expect(checkKeys(profile)).toContain(boundary)
      }
    }
  })

  it('gives every check a label, a description and a required flag', () => {
    const profiles = [...Object.values(COUNTRY_PROFILES), DEFAULT_COUNTRY_PROFILE]

    for (const profile of profiles) {
      expect(new Set(checkKeys(profile)).size).toBe(profile.checks.length)
      for (const check of profile.checks) {
        expect(check.label.length).toBeGreaterThan(0)
        expect(check.description.length).toBeGreaterThan(0)
        expect(typeof check.required).toBe('boolean')
      }
    }
  })

  it('is keyed by ISO-2 codes only, so the fallback cannot be reached by lookup', () => {
    for (const code of Object.keys(COUNTRY_PROFILES)) {
      expect(code).toMatch(/^[A-Z]{2}$/)
    }
    expect(COUNTRY_PROFILES.default).toBeUndefined()
  })
})

describe('getCountryProfile', () => {
  it('resolves a configured market regardless of case or padding', () => {
    expect(getCountryProfile('us')).toBe(COUNTRY_PROFILES.US)
    expect(getCountryProfile(' Ph ')).toBe(COUNTRY_PROFILES.PH)
  })

  it('falls back to a profile that requires human review for an unconfigured market', () => {
    const profile = getCountryProfile('ZZ')

    expect(profile.key).toBe('default-human-review')
    expect(checkKeys(profile)).toContain('market_profile_configured')
  })

  it('echoes the requested country code back so the record says which market was considered', () => {
    expect(getCountryProfile('ZZ').countryCode).toBe('ZZ')
    expect(getCountryProfile('').countryCode).toBe('')
  })

  it('never returns null, whatever it is handed', () => {
    for (const value of [null, undefined, '', 'USA', 42, {}]) {
      expect(getCountryProfile(value).checks.length).toBeGreaterThan(0)
    }
  })
})
