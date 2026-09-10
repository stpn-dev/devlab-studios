import { jsonResponse } from '../utils/responses'
import { checkRateLimit, clearRateLimit, rateLimitedResponse, clientIp } from '../rateLimit.js'
import { isAdminSessionRevoked, revokeAdminSession } from '../repositories/adminSessions.js'

const SESSION_COOKIE = 'devlab_admin_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const PASSWORD_HASH_PREFIX = 'pbkdf2_sha256'
// Retired July 2026. `sha256`/`sha256hex` were single-round salted SHA-256,
// added as a workaround while Workers' PBKDF2 iteration cap was being pinned
// down and superseded once 100,000 iterations was confirmed to work on the
// real runtime (see scripts/cms/hash-admin-password.mjs). A single SHA-256
// round is crackable at billions of guesses/sec on a commodity GPU, so these
// are no longer accepted — but they're still recognised, so a credential
// left on the old format reports a precise configuration error instead of
// failing as a plain "invalid password" nobody could diagnose.
const RETIRED_PASSWORD_HASH_PREFIXES = new Set(['sha256', 'sha256hex'])
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 8
// Per source address across ALL accounts, so spraying is bounded too.
const LOGIN_MAX_ATTEMPTS_PER_IP = 20

function textBytes(value) {
  return new TextEncoder().encode(value)
}

function bytesToBase64Url(bytes) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index]
  }

  return mismatch === 0
}

function parseCookies(cookieHeader) {
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

function getCookieOptions(c, maxAge = SESSION_MAX_AGE_SECONDS) {
  const url = new URL(c.req.url)
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${maxAge}`
}

function clearSessionCookie(c) {
  return `${SESSION_COOKIE}=; ${getCookieOptions(c, 0)}`
}

function getConfiguredAdmins(env) {
  if (env.ADMIN_USERS) {
    try {
      const users = JSON.parse(env.ADMIN_USERS)
      if (Array.isArray(users)) {
        return users
          .map((user) => ({
            email: String(user.email || '').trim().toLowerCase(),
            passwordHash: String(user.passwordHash || '').trim(),
            role: String(user.role || 'admin').trim() || 'admin',
          }))
          .filter((user) => user.email && user.passwordHash)
      }
    } catch {
      return []
    }
  }

  const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase()
  const passwordHash = String(env.ADMIN_PASSWORD_HASH || '').trim()
  if (!email || !passwordHash) return []

  return [{ email, passwordHash, role: 'owner' }]
}

async function importPasswordKey(password) {
  return crypto.subtle.importKey('raw', textBytes(password), 'PBKDF2', false, ['deriveBits'])
}

/** True for a credential stored in one of the retired weak formats. */
function usesRetiredHashFormat(storedHash) {
  return RETIRED_PASSWORD_HASH_PREFIXES.has(String(storedHash || '').split('$')[0])
}

async function verifyPassword(password, storedHash) {
  const [prefix, iterationsValue, saltValue, hashValue] = String(storedHash || '').split('$')

  const iterations = Number(iterationsValue)

  if (prefix !== PASSWORD_HASH_PREFIX || !Number.isInteger(iterations) || iterations < 100000 || !saltValue || !hashValue) {
    return false
  }

  const key = await importPasswordKey(password)
  const expectedHash = base64UrlToBytes(hashValue)
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64UrlToBytes(saltValue),
      iterations,
    },
    key,
    expectedHash.length * 8,
  )

  return constantTimeEqual(new Uint8Array(derivedBits), expectedHash)
}

async function getSessionSigningKey(secret) {
  return crypto.subtle.importKey('raw', textBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function signSessionPayload(payload, secret) {
  const encodedPayload = bytesToBase64Url(textBytes(JSON.stringify(payload)))
  const key = await getSessionSigningKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, textBytes(encodedPayload))

  return `v1.${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`
}

async function verifySessionToken(token, secret) {
  const [version, encodedPayload, encodedSignature] = String(token || '').split('.')
  if (version !== 'v1' || !encodedPayload || !encodedSignature) return null

  const key = await getSessionSigningKey(secret)
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(encodedSignature),
    textBytes(encodedPayload),
  )

  if (!isValid) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)))
    if (!payload.exp || Date.now() >= payload.exp * 1000) return null
    return payload
  } catch {
    return null
  }
}

function getSessionSecret(env) {
  return String(env.ADMIN_SESSION_SECRET || '').trim()
}

/**
 * Resolves the auth mode, and never resolves to something weaker than what
 * is actually configured.
 *
 * This used to fall back to 'cloudflare-access' whenever no session secret or
 * admin user was configured — which, combined with requireAdmin's old
 * header-trust branch, meant a missing ADMIN_SESSION_SECRET silently turned
 * into "anyone who sets a cf-access-authenticated-user-email header is an
 * admin". Misconfiguration must fail closed, so an unconfigured environment
 * now resolves to 'unconfigured' and is refused outright.
 */
function getAdminAuthMode(env) {
  const configuredMode = String(env.ADMIN_AUTH_MODE || '').trim().toLowerCase()
  if (configuredMode) return configuredMode

  return getSessionSecret(env) && getConfiguredAdmins(env).length > 0
    ? 'password'
    : 'unconfigured'
}

function getClientIp(c) {
  return c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

// Brute-force protection now goes through a Durable Object rather than a
// module-scope Map. The Map version did not work: Workers give every isolate
// its own memory, so 12 sequential wrong-password attempts from one IP were
// measured against production and all 12 returned 401 with the limit set to 8.
// See src/worker/RateLimiterDO.ts.
const LOGIN_BUCKET = 'admin-login'

export async function handleAdminLogin(c) {
  if (getAdminAuthMode(c.env) === 'disabled') {
    return jsonResponse({ error: 'Admin password login is disabled.' }, 400)
  }

  const sessionSecret = getSessionSecret(c.env)
  const admins = getConfiguredAdmins(c.env)
  if (!sessionSecret || admins.length === 0) {
    return jsonResponse({ error: 'Admin login is not configured.' }, 503)
  }

  let payload
  try {
    payload = await c.req.json()
  } catch {
    return jsonResponse({ error: 'Invalid login payload.' }, 400)
  }

  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '')
  const loginKey = `${getClientIp(c)}:${email || 'unknown'}`

  // Counted on every attempt, not only on failures, so an attacker cannot
  // avoid the limit by pipelining requests before any of them resolve.
  // TWO limits, because they stop different attacks. The ip:email one stops
  // guessing a password for a known account. On its own it is trivially
  // sidestepped by password SPRAYING -- one guess each against many addresses
  // from the same host lands on a fresh counter every time, which a first
  // draft of the test for this accidentally demonstrated. The ip-only limit is
  // the one that catches that, set higher so a shared office address running
  // into it takes real effort.
  for (const [identity, limit] of [[loginKey, LOGIN_MAX_ATTEMPTS], [clientIp(c.req.raw), LOGIN_MAX_ATTEMPTS_PER_IP]]) {
    const rate = await checkRateLimit(c.env, LOGIN_BUCKET, identity, { limit, windowMs: LOGIN_WINDOW_MS })
    if (rate.limited) {
      return rateLimitedResponse('Too many login attempts. Try again later.', rate.retryAfterSeconds)
    }
  }

  const admin = admins.find((user) => user.email === email)

  // Reported as the server-configuration fault it is, rather than as a
  // credential failure. This is unreachable unless a stored hash was never
  // migrated off the retired weak formats, and in that case an undiagnosable
  // "invalid email or password" would be far worse than naming the cause.
  if (admin && usesRetiredHashFormat(admin.passwordHash)) {
    return jsonResponse({
      error: 'This account\'s stored password hash uses a retired format that is no longer accepted. Re-generate it with `npm run cms:hash-admin-password` and update the ADMIN_PASSWORD_HASH / ADMIN_USERS secret.',
    }, 503)
  }

  const isValidPassword = Boolean(admin && await verifyPassword(password, admin.passwordHash))

  if (!isValidPassword) {
    return jsonResponse({ error: 'Invalid email or password.' }, 401)
  }

  await clearRateLimit(c.env, LOGIN_BUCKET, loginKey)

  const now = Math.floor(Date.now() / 1000)
  const token = await signSessionPayload({
    sub: admin.email,
    email: admin.email,
    role: admin.role,
    // Identifies this specific token so logout can revoke exactly it,
    // without invalidating the admin's other sessions.
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  }, sessionSecret)

  return jsonResponse(
    { ok: true, email: admin.email, role: admin.role, mode: 'password' },
    200,
    { 'Set-Cookie': `${SESSION_COOKIE}=${token}; ${getCookieOptions(c)}` },
  )
}

export async function handleAdminLogout(c) {
  // Clearing the cookie is not signing out: the token is self-contained and
  // stays valid until `exp`, so a captured copy kept working for up to 8
  // hours after the admin clicked "Log out". Record it as revoked as well.
  const sessionSecret = getSessionSecret(c.env)
  if (sessionSecret) {
    const cookies = parseCookies(c.req.header('Cookie'))
    const session = await verifySessionToken(cookies[SESSION_COOKIE], sessionSecret)

    if (session?.jti && session?.exp) {
      await revokeAdminSession(c.env.DB, {
        jti: session.jti,
        adminEmail: session.email || null,
        expiresAt: new Date(session.exp * 1000).toISOString(),
      })
    }
  }

  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': clearSessionCookie(c) },
  )
}

export async function requireAdmin(c, next) {
  const authMode = getAdminAuthMode(c.env)

  if (authMode === 'disabled') {
    c.set('adminEmail', 'admin-auth-disabled')
    c.set('adminAuthMode', 'disabled')
    return next()
  }

  if (authMode === 'password') {
    const sessionSecret = getSessionSecret(c.env)
    if (!sessionSecret) {
      return jsonResponse({ error: 'Admin session secret is not configured.' }, 503)
    }

    const cookies = parseCookies(c.req.header('Cookie'))
    const session = await verifySessionToken(cookies[SESSION_COOKIE], sessionSecret)
    if (session?.email) {
      // A signed, unexpired token is not sufficient on its own — it may have
      // been explicitly signed out. See repositories/adminSessions.js.
      if (await isAdminSessionRevoked(c.env.DB, session.jti)) {
        return jsonResponse({ error: 'This admin session has been signed out.' }, 401)
      }

      c.set('adminEmail', session.email)
      c.set('adminRole', session.role || 'admin')
      c.set('adminAuthMode', 'password')
      return next()
    }

    return jsonResponse({ error: 'Admin login is required.' }, 401)
  }

  // Anything else — including 'cloudflare-access' and 'unconfigured' — is
  // refused. The old 'cloudflare-access' branch authenticated purely on the
  // `cf-access-authenticated-user-email` request header without verifying
  // the signed `Cf-Access-Jwt-Assertion` that accompanies it, so any caller
  // able to set that header was an admin. ADMIN_AUTH_MODE is 'password' in
  // both deployed environments (wrangler.jsonc), so nothing relied on it.
  // Reinstating the mode means verifying that JWT against Access's JWKS.
  return jsonResponse({ error: 'Admin authentication is not configured for this environment.' }, 503)
}
