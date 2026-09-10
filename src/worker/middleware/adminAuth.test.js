import { describe, it, expect, vi } from 'vitest'
import { handleAdminLogin, handleAdminLogout, requireAdmin } from './adminAuth.js'

/**
 * Covers the auth properties that are easy to regress silently and expensive
 * to get wrong: that misconfiguration fails CLOSED, that a retired hash
 * format is refused, and that logout genuinely invalidates a token rather
 * than only dropping the cookie.
 */

const SESSION_SECRET = 'test-session-secret-value'
const PASSWORD = 'correct-horse-battery'
const EMAIL = 'admin@example.com'

function base64Url(bytes) {
  let binary = ''
  new Uint8Array(bytes).forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Builds a real pbkdf2_sha256 hash in the format verifyPassword expects. */
async function pbkdf2Hash(password, iterations = 100000) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return `pbkdf2_sha256$${iterations}$${base64Url(salt)}$${base64Url(bits)}`
}

/** In-memory stand-in for the admin_session_revocations table. */
function fakeDb() {
  const revoked = new Map()

  return {
    revoked,
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) {
          statement.args = args
          return statement
        },
        async run() {
          if (sql.includes('INSERT INTO admin_session_revocations')) {
            const [jti, adminEmail, revokedAt, expiresAt] = statement.args
            if (!revoked.has(jti)) revoked.set(jti, { adminEmail, revokedAt, expiresAt })
          }
          return { success: true }
        },
        async first() {
          if (sql.includes('SELECT 1 AS revoked')) {
            const [jti] = statement.args
            return revoked.has(jti) ? { revoked: 1 } : null
          }
          return null
        },
      }
      return statement
    },
  }
}

function makeContext({ env, cookie, url = 'https://example.com/api/admin/session', body }) {
  const locals = {}
  return {
    locals,
    req: {
      header: (name) => (name.toLowerCase() === 'cookie' ? cookie || null : null),
      json: async () => body,
      raw: new Request(url, { headers: cookie ? { Cookie: cookie } : {} }),
      url,
    },
    env,
    set(key, value) { locals[key] = value },
    get(key) { return locals[key] },
  }
}

function cookieFrom(response) {
  const header = response.headers.get('Set-Cookie') || ''
  return header.split(';')[0]
}

async function loginAndGetCookie(env) {
  const response = await handleAdminLogin(
    makeContext({ env, body: { email: EMAIL, password: PASSWORD } }),
  )
  expect(response.status).toBe(200)
  return cookieFrom(response)
}

async function passwordEnv(overrides = {}) {
  return {
    ADMIN_AUTH_MODE: 'password',
    ADMIN_SESSION_SECRET: SESSION_SECRET,
    ADMIN_EMAIL: EMAIL,
    ADMIN_PASSWORD_HASH: await pbkdf2Hash(PASSWORD),
    DB: fakeDb(),
    ...overrides,
  }
}

describe('admin auth: configuration failure modes', () => {
  it('fails CLOSED when no session secret or admin is configured', async () => {
    // Previously this fell through to 'cloudflare-access', which trusted a
    // request header — so a missing secret silently granted admin access.
    const next = vi.fn()
    const response = await requireAdmin(makeContext({ env: { DB: fakeDb() } }), next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
  })

  it('does not trust the cf-access-authenticated-user-email header', async () => {
    const next = vi.fn()
    const context = makeContext({ env: { ADMIN_AUTH_MODE: 'cloudflare-access', DB: fakeDb() } })
    context.req.header = (name) =>
      (name.toLowerCase() === 'cf-access-authenticated-user-email' ? 'attacker@example.com' : null)
    context.req.raw = new Request('https://example.com/api/admin/session', {
      headers: { 'cf-access-authenticated-user-email': 'attacker@example.com' },
    })

    const response = await requireAdmin(context, next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
  })

  it('refuses an unrecognised auth mode rather than defaulting to access', async () => {
    const next = vi.fn()
    const response = await requireAdmin(
      makeContext({ env: { ADMIN_AUTH_MODE: 'something-else', DB: fakeDb() } }),
      next,
    )

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
  })
})

describe('admin auth: password hash formats', () => {
  it('accepts a pbkdf2_sha256 credential', async () => {
    const response = await handleAdminLogin(
      makeContext({ env: await passwordEnv(), body: { email: EMAIL, password: PASSWORD } }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toContain('devlab_admin_session=')
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly')
    expect(response.headers.get('Set-Cookie')).toContain('SameSite=Strict')
  })

  it('rejects a wrong password', async () => {
    const response = await handleAdminLogin(
      makeContext({ env: await passwordEnv(), body: { email: EMAIL, password: 'wrong' } }),
    )

    expect(response.status).toBe(401)
  })

  it('reports a retired sha256 hash as a config error, not a bad password', async () => {
    // A single-round SHA-256 hash is no longer accepted. Surfacing it as 503
    // with a specific message is what stops it becoming an undiagnosable
    // lockout, so this message is deliberately part of the contract.
    const env = await passwordEnv({ ADMIN_PASSWORD_HASH: 'sha256$c2FsdA$aGFzaA' })
    const response = await handleAdminLogin(
      makeContext({ env, body: { email: EMAIL, password: PASSWORD } }),
    )

    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/retired format/i)
  })

  it('reports a retired sha256hex hash the same way', async () => {
    const env = await passwordEnv({ ADMIN_PASSWORD_HASH: 'sha256hex$abcd$ef01' })
    const response = await handleAdminLogin(
      makeContext({ env, body: { email: EMAIL, password: PASSWORD } }),
    )

    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/retired format/i)
  })

  it('rejects a pbkdf2 hash below the 100k iteration floor', async () => {
    const env = await passwordEnv({ ADMIN_PASSWORD_HASH: await pbkdf2Hash(PASSWORD, 1000) })
    const response = await handleAdminLogin(
      makeContext({ env, body: { email: EMAIL, password: PASSWORD } }),
    )

    expect(response.status).toBe(401)
  })
})

describe('admin auth: logout revokes the session', () => {
  it('accepts a freshly issued session', async () => {
    const env = await passwordEnv()
    const cookie = await loginAndGetCookie(env)
    const next = vi.fn(async () => undefined)

    await requireAdmin(makeContext({ env, cookie }), next)

    expect(next).toHaveBeenCalled()
  })

  it('rejects the same token after logout, not just clearing the cookie', async () => {
    const env = await passwordEnv()
    const cookie = await loginAndGetCookie(env)

    const logout = await handleAdminLogout(makeContext({ env, cookie }))
    expect(logout.status).toBe(200)
    // Cookie cleared...
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0')
    // ...and the token itself recorded as revoked, which is the part that
    // makes a captured copy stop working.
    expect(env.DB.revoked.size).toBe(1)

    const next = vi.fn()
    const response = await requireAdmin(makeContext({ env, cookie }), next)

    expect(next).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
  })

  it('revokes only the session that logged out', async () => {
    const env = await passwordEnv()
    const firstCookie = await loginAndGetCookie(env)
    const secondCookie = await loginAndGetCookie(env)

    await handleAdminLogout(makeContext({ env, cookie: firstCookie }))

    const next = vi.fn(async () => undefined)
    await requireAdmin(makeContext({ env, cookie: secondCookie }), next)

    expect(next).toHaveBeenCalled()
  })

  it('still signs out when the revocation table is unavailable', async () => {
    // A deploy that lands before migration 0008 must not break logout; it
    // degrades to the cookie-clearing behaviour that shipped before.
    const env = await passwordEnv({
      DB: { prepare() { throw new Error('no such table: admin_session_revocations') } },
    })
    const cookie = await loginAndGetCookie(env)

    const response = await handleAdminLogout(makeContext({ env, cookie }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')
  })

  it('issues a distinct jti per login so revocations cannot collide', async () => {
    const env = await passwordEnv()
    const first = await loginAndGetCookie(env)
    const second = await loginAndGetCookie(env)

    const jti = (cookie) => JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(cookie.split('=')[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
            .padEnd(Math.ceil(cookie.split('=')[1].split('.')[1].length / 4) * 4, '=')),
          (character) => character.charCodeAt(0),
        ),
      ),
    ).jti

    expect(jti(first)).toBeTruthy()
    expect(jti(first)).not.toBe(jti(second))
  })
})
