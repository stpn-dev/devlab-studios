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
