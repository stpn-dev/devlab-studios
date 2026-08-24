import { hmacSign, hmacVerify, bytesToBase64Url, base64UrlToBytes, textBytes } from '../../lib/pickleball/webCrypto.js'

export const SESSION_COOKIE_NAME = 'devlab_pb_session'

export async function signSession(payload, secret) {
  const encodedPayload = bytesToBase64Url(textBytes(JSON.stringify(payload)))
  const signature = await hmacSign(encodedPayload, secret)
  return `v1.${encodedPayload}.${signature}`
}

export async function verifySession(token, secret) {
  const [version, encodedPayload, signature] = String(token || '').split('.')
  if (version !== 'v1' || !encodedPayload || !signature) return null

  const isValid = await hmacVerify(encodedPayload, signature, secret)
  if (!isValid) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)))
    if (!payload.exp || Date.now() >= payload.exp * 1000) return null
    return payload
  } catch {
    return null
  }
}

export function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) return cookies

      const name = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      cookies[name] = value
      return cookies
    }, {})
}

export function buildSetCookieHeader(name, value, { secure, maxAgeSeconds }) {
  const secureFlag = secure ? '; Secure' : ''
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=${maxAgeSeconds}`
}

export function buildClearCookieHeader(name, { secure }) {
  return buildSetCookieHeader(name, '', { secure, maxAgeSeconds: 0 })
}
