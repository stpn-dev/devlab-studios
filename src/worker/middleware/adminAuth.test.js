import { describe, it, expect, vi } from 'vitest'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { handleAdminLogin, handleAdminLogout, handleAdminPasswordChange, requireAdmin } from './adminAuth.js'

/**
 * Covers the auth properties that are easy to regress silently and expensive
 * to get wrong: that misconfiguration fails CLOSED, that a retired hash
 * format is refused, and that logout genuinely invalidates a token rather
 * than only dropping the cookie.
 */

const SESSION_SECRET = 'test-session-secret-value'
const PASSWORD = 'correct-horse-battery'
const NEW_PASSWORD = 'a-brand-new-password'
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

/** In-memory stand-in for the admin_session_revocations and admin_credentials tables. */
function fakeDb({ credentials = new Map() } = {}) {
  const revoked = new Map()

  return {
    revoked,
    credentials,
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
          if (sql.includes('INSERT INTO admin_credentials')) {
            const [email, passwordHash, role, passwordChangedAt] = statement.args
            credentials.set(email, {
              email,
              password_hash: passwordHash,
              role,
              password_changed_at: passwordChangedAt,
            })
          }
          return { success: true }
        },
        async first() {
          if (sql.includes('SELECT 1 AS revoked')) {
            const [jti] = statement.args
            return revoked.has(jti) ? { revoked: 1 } : null
          }
          if (sql.includes('FROM admin_credentials')) {
            const [email] = statement.args
            return credentials.get(email) || null
          }
          return null
        },
      }
      return statement
    },
  }
}

function makeContext({ env, cookie, url = 'https://example.com/api/admin/session', body, locals: seed }) {
  const locals = { ...(seed || {}) }
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

  /**
   * The generator script (scripts/cms/hash-admin-password.mjs) builds hashes
   * with node:crypto's pbkdf2Sync and its own base64url encoder, while
   * verifyPassword checks them with WebCrypto and a separate base64url
   * decoder. Nothing else pins those two implementations together, and a
   * mismatch between them is invisible until an admin is locked out of
   * production — which is exactly what happened before this test existed.
   */
  it('accepts a credential produced by the hash-admin-password script', async () => {
    const salt = randomBytes(16)
    const derived = pbkdf2Sync(PASSWORD, salt, 100000, 32, 'sha256')
    const toBase64Url = (buffer) =>
      buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const scriptHash = `pbkdf2_sha256$100000$${toBase64Url(salt)}$${toBase64Url(derived)}`

    const response = await handleAdminLogin(
      makeContext({ env: await passwordEnv({ ADMIN_PASSWORD_HASH: scriptHash }), body: { email: EMAIL, password: PASSWORD } }),
    )

    expect(response.status).toBe(200)
  })

  it('rejects a wrong password against a script-produced credential', async () => {
    const salt = randomBytes(16)
    const derived = pbkdf2Sync(PASSWORD, salt, 100000, 32, 'sha256')
    const toBase64Url = (buffer) =>
      buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    const scriptHash = `pbkdf2_sha256$100000$${toBase64Url(salt)}$${toBase64Url(derived)}`

    const response = await handleAdminLogin(
      makeContext({ env: await passwordEnv({ ADMIN_PASSWORD_HASH: scriptHash }), body: { email: EMAIL, password: `${PASSWORD}x` } }),
    )

    expect(response.status).toBe(401)
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

describe('admin auth: credential resolution (D1 first, env as bootstrap)', () => {
  it('uses the D1 credential when one exists, in preference to the env one', async () => {
    const env = await passwordEnv()
    // A DIFFERENT password stored in D1 than the one in the env secret.
    await handleAdminPasswordChange(
      makeContext({
        env,
        locals: { adminEmail: EMAIL },
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      }),
    )

    const withNew = await handleAdminLogin(makeContext({ env, body: { email: EMAIL, password: NEW_PASSWORD } }))
    expect(withNew.status).toBe(200)

    // The env credential is now superseded, not merely ignored on write.
    const withOld = await handleAdminLogin(makeContext({ env, body: { email: EMAIL, password: PASSWORD } }))
    expect(withOld.status).toBe(401)
  })

  it('falls back to the env credential while the table is empty', async () => {
    // The no-lockout property: shipping the migration changes nothing until
    // the form is used once.
    const response = await handleAdminLogin(
      makeContext({ env: await passwordEnv(), body: { email: EMAIL, password: PASSWORD } }),
    )
    expect(response.status).toBe(200)
  })

  it('falls back to the env credential when the D1 read throws', async () => {
    // A database blip must not take the CMS offline.
    const env = await passwordEnv({
      DB: {
        prepare() {
          return { bind() { return this }, async first() { throw new Error('D1 unavailable') }, async run() {} }
        },
      },
    })

    const response = await handleAdminLogin(makeContext({ env, body: { email: EMAIL, password: PASSWORD } }))
    expect(response.status).toBe(200)
  })
})

describe('admin auth: changing the password', () => {
  function changeContext(env, body) {
    return makeContext({ env, locals: { adminEmail: EMAIL }, body })
  }

  it('changes the password and issues a fresh session for this browser', async () => {
    const env = await passwordEnv()
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    )

    expect(response.status).toBe(200)
    // Succeeding must not sign the operator out of the browser they used.
    expect(response.headers.get('Set-Cookie')).toContain('devlab_admin_session=')
    expect((await response.json()).signedOutOtherSessions).toBe(true)
  })

  it('stores a hash the existing verifier accepts', async () => {
    // Round-trip guard: the change path must not become a second hash format.
    const env = await passwordEnv()
    await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    )

    const stored = env.DB.credentials.get(EMAIL)
    expect(stored.password_hash.startsWith('pbkdf2_sha256$100000$')).toBe(true)

    const login = await handleAdminLogin(makeContext({ env, body: { email: EMAIL, password: NEW_PASSWORD } }))
    expect(login.status).toBe(200)
  })

  it('rejects a wrong current password and writes nothing', async () => {
    const env = await passwordEnv()
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: 'wrong', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).field).toBe('currentPassword')
    expect(env.DB.credentials.size).toBe(0)
  })

  it('rejects a new password under the 12-character floor', async () => {
    const env = await passwordEnv()
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: 'short', confirmPassword: 'short' }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).field).toBe('newPassword')
    expect(env.DB.credentials.size).toBe(0)
  })

  it('rejects a mismatched confirmation', async () => {
    const env = await passwordEnv()
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: `${NEW_PASSWORD}x` }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).field).toBe('confirmPassword')
  })

  it('rejects reusing the current password', async () => {
    const env = await passwordEnv()
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: PASSWORD, confirmPassword: PASSWORD }),
    )

    expect(response.status).toBe(400)
    expect(env.DB.credentials.size).toBe(0)
  })

  it('reports a retired stored hash as a config error rather than a wrong password', async () => {
    const env = await passwordEnv({ ADMIN_PASSWORD_HASH: 'sha256$c2FsdA$aGFzaA' })
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    )

    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/retired format/i)
  })

  it('refuses when the database is unavailable instead of claiming success', async () => {
    const env = await passwordEnv({ DB: undefined })
    const response = await handleAdminPasswordChange(
      changeContext(env, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    )

    expect(response.status).toBe(503)
  })

  it('requires an authenticated identity', async () => {
    const env = await passwordEnv()
    const response = await handleAdminPasswordChange(
      makeContext({ env, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } }),
    )

    expect(response.status).toBe(401)
  })
})

describe('admin auth: a password change signs out other sessions', () => {
  it('rejects a session issued before the password changed', async () => {
    const env = await passwordEnv()
    const staleCookie = await loginAndGetCookie(env)

    // That session works right up until the change.
    let reached = false
    await requireAdmin(makeContext({ env, cookie: staleCookie }), async () => { reached = true })
    expect(reached).toBe(true)

    // The token's `iat` is in whole SECONDS, so login and the change landing in
    // the same second would leave iat === password_changed_at and the strict
    // `<` comparison would not fire. Fake timers make the gap deterministic
    // rather than depending on how fast the test happens to run.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 2000))
    const changed = await handleAdminPasswordChange(
      makeContext({
        env,
        locals: { adminEmail: EMAIL },
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      }),
    )
    expect(changed.status).toBe(200)

    reached = false
    const response = await requireAdmin(makeContext({ env, cookie: staleCookie }), async () => { reached = true })
    expect(reached).toBe(false)
    expect(response.status).toBe(401)
    expect((await response.json()).error).toMatch(/password changed/i)

    vi.useRealTimers()
  })

  it('accepts the fresh session the change issued', async () => {
    const env = await passwordEnv()
    const changed = await handleAdminPasswordChange(
      makeContext({
        env,
        locals: { adminEmail: EMAIL },
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      }),
    )

    let reached = false
    await requireAdmin(makeContext({ env, cookie: cookieFrom(changed) }), async () => { reached = true })
    expect(reached).toBe(true)
  })
})
