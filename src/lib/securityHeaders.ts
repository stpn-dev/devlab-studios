const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com",
  "connect-src 'self' https://*.zohopublic.com https://*.zoho.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://challenges.cloudflare.com",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "frame-src 'self' https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

const BASE_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
}

function robotsTagFor(pathname: string): string | null {
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) return 'noindex, nofollow'
  if (pathname.startsWith('/landing-sample-')) return 'noindex, follow'
  return null
}

/**
 * public/_headers only ever applies to responses served directly from the
 * static ASSETS binding. With output:'server', almost every real response —
 * every page, /admin, every /api/* route — is instead rendered by Astro and
 * passes through this middleware, so _headers never actually reached them
 * (confirmed by curling a built-and-served page: no CSP/HSTS/etc showed up).
 * This is the real enforcement point; _headers stays only as a redundant
 * safety net for the genuinely-static leftovers (robots.txt, /_astro/*, ...).
 */
export function applySecurityHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers)

  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    headers.set(name, value)
  }

  const robotsTag = robotsTagFor(pathname)
  if (robotsTag) {
    headers.set('X-Robots-Tag', robotsTag)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
