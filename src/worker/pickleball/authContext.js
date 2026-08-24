import { parseCookies, verifySession, SESSION_COOKIE_NAME } from './session.js'
import { getMembership } from '../repositories/pickleball/memberships.js'

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

  if (!session.activeOrgId) {
    const error = new Error('No active organization selected.')
    error.status = 403
    throw error
  }

  const membership = await getMembership(env.PICKLEBALL_DB, {
    organizationId: session.activeOrgId,
    userId: session.userId,
  })

  if (!membership) {
    const error = new Error('No active membership in this organization.')
    error.status = 403
    throw error
  }

  return { userId: session.userId, googleSub: session.googleSub, activeOrgId: session.activeOrgId, role: membership.role }
}
