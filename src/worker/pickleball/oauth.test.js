import { describe, it, expect } from 'vitest'
import { generatePkcePair, buildGoogleAuthorizationUrl } from './oauth.js'
import { sha256Base64Url } from '../../lib/pickleball/webCrypto.js'

describe('generatePkcePair', () => {
  it('produces a challenge that is the SHA-256/base64url of the verifier', async () => {
    const { verifier, challenge } = await generatePkcePair()
    expect(challenge).toBe(await sha256Base64Url(verifier))
  })

  it('produces a different verifier on each call', async () => {
    const first = await generatePkcePair()
    const second = await generatePkcePair()
    expect(first.verifier).not.toBe(second.verifier)
  })
})

describe('buildGoogleAuthorizationUrl', () => {
  it('targets the Google authorization endpoint with PKCE and state params', () => {
    const url = new URL(buildGoogleAuthorizationUrl({
      clientId: 'client-123',
      redirectUri: 'https://example.com/callback',
      state: 'state-value',
      codeChallenge: 'challenge-value',
      scopes: ['openid', 'email', 'profile'],
    }))

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('state-value')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
  })
})
