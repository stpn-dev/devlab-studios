import { parseCookies, verifySession, SESSION_COOKIE_NAME } from './session.js'
import { getMembership } from '../repositories/pickleball/memberships.js'
import { getOrganization } from '../repositories/pickleball/organizations.js'
import { isPlatformAdmin } from '../repositories/pickleball/users.js'

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 8
const loginAttempts = new Map()

export function resolveActiveOrgId(memberships, requestedOrgId) {
  if (!memberships.length) return null
  const requestedMatch = memberships.find((membership) => membership.organizationId === requestedOrgId)
  return requestedMatch ? requestedMatch.organizationId : memberships[0].organizationId
}

export function pickSessionRole(memberships, activeOrgId) {
  const membership = memberships.find((item) => item.organizationId === activeOrgId)
  return membership ? membership.role : null
}

export function isLoginRateLimited(key) {
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    return false
  }

  return attempt.count >= LOGIN_MAX_ATTEMPTS
}

export function recordFailedLogin(key) {
  const now = Date.now()
  const attempt = loginAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }

  attempt.count += 1
}

export function clearFailedLogins(key) {
  loginAttempts.delete(key)
}

// Mirrors the header-fallback order in src/worker/middleware/adminAuth.js's
// getClientIp — Cloudflare sets cf-connecting-ip in production; local
// `wrangler dev` and any proxy in front only set x-forwarded-for. Kept here
// (rather than imported from the CMS middleware) so the Pickleball subsystem
// stays independent of the Admin CMS, per the design's isolation rule.
export function getRequestIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  return request.headers.get('cf-connecting-ip')
    || (forwardedFor ? forwardedFor.split(',')[0].trim() : '')
    || 'unknown'
}

// The login rate-limit bucket is keyed by ip:email so a single client cannot
// probe many addresses, and a single address cannot be locked out globally by
// an unrelated attacker. Used by both the real Google callback and the
// env-gated test-login bypass.
export function buildLoginRateLimitKey(request, email) {
  return `${getRequestIp(request)}:${String(email || '').trim().toLowerCase() || 'unknown'}`
}

// Verifies the session cookie is a genuine, unexpired Google-authenticated
// session and returns identity only — no org/membership requirement. Used
// by the org-invite accept flow, where the caller by definition has no
// membership anywhere yet.
export async function requireGoogleIdentity(request, env) {
  const secret = env.PICKLEBALL_SESSION_SECRET
  if (!secret) {
    const error = new Error('Pickleball session secret is not configured.')
    error.status = 503
    throw error
  }

  const cookies = parseCookies(request.headers.get('Cookie'))
  const session = await verifySession(cookies[SESSION_COOKIE_NAME], secret)
  if (!session?.userId) {
    const error = new Error('Pickleball login is required.')
    error.status = 401
    throw error
  }

  return { userId: session.userId, googleSub: session.googleSub }
}

// Authenticates via Google identity only (no org/membership requirement) and
// asserts the caller is a platform admin. Used by the platform-admin-only
// routes under src/pages/api/pickleball/platform/, which operate across all
// organizations and must not depend on the caller's activeOrgId — deriving
// authorization through requirePickleballSession would 403 a platform admin
// whose activeOrgId happens to point at a SUSPENDED org, locking them out of
// the very Platform page that lets them reactivate it.
export async function requirePlatformAdmin(request, env) {
  const identity = await requireGoogleIdentity(request, env)

  const platformAdmin = await isPlatformAdmin(env.PICKLEBALL_DB, identity.userId)
  if (!platformAdmin) {
    const error = new Error('Forbidden.')
    error.status = 403
    throw error
  }

  return { userId: identity.userId, googleSub: identity.googleSub, isPlatformAdmin: true }
}

export async function requirePickleballSession(request, env) {
  const secret = env.PICKLEBALL_SESSION_SECRET
  if (!secret) {
    const error = new Error('Pickleball session secret is not configured.')
    error.status = 503
    throw error
  }

  const cookies = parseCookies(request.headers.get('Cookie'))
  const session = await verifySession(cookies[SESSION_COOKIE_NAME], secret)
  if (!session?.userId) {
    const error = new Error('Pickleball login is required.')
    error.status = 401
    throw error
  }

  const platformAdmin = await isPlatformAdmin(env.PICKLEBALL_DB, session.userId)

  if (!session.activeOrgId) {
    if (platformAdmin) {
      return { userId: session.userId, googleSub: session.googleSub, activeOrgId: null, role: null, isPlatformAdmin: true }
    }
    const error = new Error('No active organization selected.')
    error.status = 403
    throw error
  }

  const membership = await getMembership(env.PICKLEBALL_DB, {
    organizationId: session.activeOrgId,
    userId: session.userId,
  })

  if (!membership && !platformAdmin) {
    const error = new Error('No active membership in this organization.')
    error.status = 403
    throw error
  }

  // Centralized here (rather than in each of the ~32 org-scoped route
  // files) because every one of them already calls requirePickleballSession
  // first — one check here covers all of them. Applies to a platform admin
  // too: suspension is absolute, reactivate the org before acting on it.
  const organization = await getOrganization(env.PICKLEBALL_DB, session.activeOrgId)
  if (!organization || organization.status === 'SUSPENDED') {
    const error = new Error('This organization is suspended.')
    error.status = 403
    throw error
  }

  if (!membership) {
    return { userId: session.userId, googleSub: session.googleSub, activeOrgId: session.activeOrgId, role: null, isPlatformAdmin: platformAdmin }
  }

  return {
    userId: session.userId,
    googleSub: session.googleSub,
    activeOrgId: session.activeOrgId,
    role: membership.role,
    isPlatformAdmin: platformAdmin,
  }
}
