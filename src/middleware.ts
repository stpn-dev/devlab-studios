import { defineMiddleware } from 'astro:middleware'
import { requireAdmin } from './worker/middleware/adminAuth.js'
import { createHonoLikeContext } from './lib/honoShim.js'
import { getEnv } from './lib/env'

const ADMIN_API_PREFIX = '/api/admin/'
const ADMIN_PUBLIC_ROUTES = new Set(['/api/admin/login', '/api/admin/logout'])

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url)
  const forwardedProto = context.request.headers.get('x-forwarded-proto')
  const shouldUseWww = url.hostname === 'devlabstudios.com'
  const shouldUseHttps = url.hostname.endsWith('devlabstudios.com') && (url.protocol === 'http:' || forwardedProto === 'http')

  if (shouldUseWww || shouldUseHttps) {
    url.hostname = 'www.devlabstudios.com'
    url.protocol = 'https:'
    return Response.redirect(url.toString(), 301)
  }

  if (url.pathname.startsWith(ADMIN_API_PREFIX) && !ADMIN_PUBLIC_ROUTES.has(url.pathname)) {
    const honoContext = createHonoLikeContext(context.request, getEnv(), context.locals)
    let didContinue = false
    const result = await requireAdmin(honoContext, async () => {
      didContinue = true
      return undefined
    })

    if (!didContinue) {
      return result
    }
  }

  return next()
})
