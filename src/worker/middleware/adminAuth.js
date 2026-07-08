import { jsonResponse } from '../utils/responses'

export async function requireAdmin(c, next) {
  const request = c.req.raw
  const accessEmail = request.headers.get('cf-access-authenticated-user-email')
  const configuredEmail = c.env.ADMIN_EMAIL

  if (accessEmail && (!configuredEmail || accessEmail.toLowerCase() === configuredEmail.toLowerCase())) {
    c.set('adminEmail', accessEmail)
    return next()
  }

  return jsonResponse({ error: 'Admin access requires Cloudflare Access authentication.' }, 401)
}
