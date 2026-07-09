import { jsonResponse } from '../utils/responses'

const SESSION_COOKIE = 'devlab_admin_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8
const PASSWORD_HASH_PREFIX = 'pbkdf2_sha256'
const FAST_PASSWORD_HASH_PREFIX = 'sha256'
const HEX_PASSWORD_HASH_PREFIX = 'sha256hex'
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 8
const loginAttempts = new Map()

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

function concatBytes(...arrays) {
  const length = arrays.reduce((total, item) => total + item.length, 0)
  const output = new Uint8Array(length)
  let offset = 0

  arrays.forEach((item) => {
    output.set(item, offset)
    offset += item.length
  })

  return output
}

function hexToBytes(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!/^[a-f0-9]+$/.test(normalized) || normalized.length % 2 !== 0) return null

  const bytes = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }

  return bytes
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

async function verifySha256Password(password, saltValue, hashValue) {
  if (!saltValue || !hashValue) return false

  const expectedHash = base64UrlToBytes(hashValue)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    concatBytes(base64UrlToBytes(saltValue), textBytes(password)),
  )

  return constantTimeEqual(new Uint8Array(digest), expectedHash)
}

async function verifySha256HexPassword(password, saltValue, hashValue) {
  const salt = hexToBytes(saltValue)
  const expectedHash = hexToBytes(hashValue)
  if (!salt || !expectedHash) return false

  const digest = await crypto.subtle.digest(
    'SHA-256',
    concatBytes(salt, textBytes(password)),
  )

  return constantTimeEqual(new Uint8Array(digest), expectedHash)
}

async function verifyPassword(password, storedHash) {
  const [prefix, iterationsValue, saltValue, hashValue] = String(storedHash || '').split('$')

  if (prefix === FAST_PASSWORD_HASH_PREFIX) {
    return verifySha256Password(password, iterationsValue, saltValue)
  }

  if (prefix === HEX_PASSWORD_HASH_PREFIX) {
    return verifySha256HexPassword(password, iterationsValue, saltValue)
  }

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

function getAdminAuthMode(env) {
  const configuredMode = String(env.ADMIN_AUTH_MODE || '').trim().toLowerCase()
  if (configuredMode) return configuredMode

  return getSessionSecret(env) && getConfiguredAdmins(env).length > 0
    ? 'password'
    : 'cloudflare-access'
}

function getClientIp(c) {
  return c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

function isLoginRateLimited(key) {
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS })
    return false
  }

  return attempt.count >= LOGIN_MAX_ATTEMPTS
}

function recordFailedLogin(key) {
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }

  attempt.count += 1
}

function clearFailedLogins(key) {
  loginAttempts.delete(key)
}

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

  if (isLoginRateLimited(loginKey)) {
    return jsonResponse({ error: 'Too many login attempts. Try again later.' }, 429)
  }

  const admin = admins.find((user) => user.email === email)

  const isValidPassword = Boolean(admin && await verifyPassword(password, admin.passwordHash))

  if (!isValidPassword) {
    recordFailedLogin(loginKey)
    return jsonResponse({ error: 'Invalid email or password.' }, 401)
  }

  clearFailedLogins(loginKey)

  const now = Math.floor(Date.now() / 1000)
  const token = await signSessionPayload({
    sub: admin.email,
    email: admin.email,
    role: admin.role,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  }, sessionSecret)

  return jsonResponse(
    { ok: true, email: admin.email, role: admin.role, mode: 'password' },
    200,
    { 'Set-Cookie': `${SESSION_COOKIE}=${token}; ${getCookieOptions(c)}` },
  )
}

export function handleAdminLogout(c) {
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
      c.set('adminEmail', session.email)
      c.set('adminRole', session.role || 'admin')
      c.set('adminAuthMode', 'password')
      return next()
    }

    return jsonResponse({ error: 'Admin login is required.' }, 401)
  }

  const request = c.req.raw
  const accessEmail = request.headers.get('cf-access-authenticated-user-email')
  const configuredEmail = c.env.ADMIN_EMAIL

  if (accessEmail && (!configuredEmail || accessEmail.toLowerCase() === configuredEmail.toLowerCase())) {
    c.set('adminEmail', accessEmail)
    c.set('adminAuthMode', 'cloudflare-access')
    return next()
  }

  return jsonResponse({ error: 'Admin access requires Cloudflare Access authentication.' }, 401)
}
