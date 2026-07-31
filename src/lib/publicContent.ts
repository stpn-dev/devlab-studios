import { getEnv } from './env'

const PUBLIC_CONTENT_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
}

export function publicJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: PUBLIC_CONTENT_CACHE_HEADERS })
}

/**
 * Shared shape for every public GET endpoint that falls back to
 * `{ data: null, source: 'static-fallback', configured: false }` when D1
 * is unconfigured or the query fails, matching the client hooks' expected
 * contract (src/hooks/use*Content.js).
 */
export async function servePublicContent<T>(
  loader: (db: D1Database) => Promise<T>,
  emptyValue: T,
): Promise<Response> {
  const env = getEnv()

  if (!env.DB) {
    return publicJson({ data: emptyValue, source: 'static-fallback', configured: false })
  }

  try {
    const data = await loader(env.DB)
    return publicJson({ data, source: 'd1', configured: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ data: emptyValue, source: 'static-fallback', configured: false, error: message }), {
      status: 200,
      headers: PUBLIC_CONTENT_CACHE_HEADERS,
    })
  }
}
