import { randomBase64Url, sha256Base64Url } from '../../lib/pickleball/webCrypto.js'

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'

export async function generatePkcePair() {
  const verifier = randomBase64Url(32)
  const challenge = await sha256Base64Url(verifier)
  return { verifier, challenge }
}

export function buildGoogleAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, scopes }) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('access_type', 'online')
  return url.toString()
}

export async function exchangeGoogleCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = new Error('Google OAuth code exchange failed.')
    error.status = 502
    throw error
  }

  const body = await response.json()
  return { accessToken: body.access_token }
}

export async function fetchGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const error = new Error('Failed to fetch Google profile.')
    error.status = 502
    throw error
  }

  const body = await response.json()
  return { sub: body.sub, email: body.email, name: body.name || body.email, picture: body.picture || '' }
}
