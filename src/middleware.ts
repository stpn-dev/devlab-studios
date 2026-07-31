import { defineMiddleware } from 'astro:middleware'
import { requireAdmin } from './worker/middleware/adminAuth.js'
import { createHonoLikeContext } from './lib/honoShim.js'
import { getEnv } from './lib/env'
import { getSiteSetting } from './worker/repositories/content.js'
import { findRedirect } from './worker/repositories/redirects.js'
import { applySecurityHeaders } from './lib/securityHeaders'

const ADMIN_API_PREFIX = '/api/admin/'
const ADMIN_PUBLIC_ROUTES = new Set(['/api/admin/login', '/api/admin/logout'])
const MAINTENANCE_PAGE = '/maintenance'
const MAINTENANCE_GATED_PATHS = new Set(['/', '/about', '/services', '/profile', '/insights'])

function isMaintenanceGated(pathname: string): boolean {
  return MAINTENANCE_GATED_PATHS.has(pathname) || pathname.startsWith('/insights/')
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url)
  const forwardedProto = context.request.headers.get('x-forwarded-proto')
  const shouldUseWww = url.hostname === 'devlabstudios.com'
  const shouldUseHttps = url.hostname.endsWith('devlabstudios.com') && (url.protocol === 'http:' || forwardedProto === 'http')

  if (shouldUseWww || shouldUseHttps) {
    url.hostname = 'www.devlabstudios.com'
    url.protocol = 'https:'
    return applySecurityHeaders(Response.redirect(url.toString(), 301), url.pathname)
  }

  if (url.pathname.startsWith(ADMIN_API_PREFIX) && !ADMIN_PUBLIC_ROUTES.has(url.pathname)) {
    const honoContext = createHonoLikeContext(context.request, getEnv(), context.locals)
    let didContinue = false
    const result = await requireAdmin(honoContext, async () => {
      didContinue = true
      return undefined
    })

    if (!didContinue) {
      return applySecurityHeaders(result, url.pathname)
    }
  }

  if (isMaintenanceGated(url.pathname) && url.pathname !== MAINTENANCE_PAGE) {
    const env = getEnv()
    const maintenanceMode = env.DB ? await getSiteSetting(env.DB, 'maintenance_mode', false) : false
    if (maintenanceMode) {
      return applySecurityHeaders(await next(MAINTENANCE_PAGE), url.pathname)
    }
  }

  const response = await next()

  // The admin's Redirects screen (D1 `redirects` table) only needs to be
  // consulted for paths nothing else already handled — so this only ever
  // runs on an actual 404, not on every request/asset.
  if (context.request.method === 'GET' && response.status === 404) {
    const env = getEnv()
    if (env.DB) {
      const redirect = await findRedirect(env.DB, url.pathname)
      if (redirect) {
        const destination = new URL(redirect.toPath, url)
        return applySecurityHeaders(Response.redirect(destination.toString(), redirect.statusCode), url.pathname)
      }
    }
  }

  return applySecurityHeaders(response, url.pathname)
})
