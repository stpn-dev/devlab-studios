import type { APIRoute } from 'astro'
import { getEnv } from '../../lib/env'

export const GET: APIRoute = () => {
  const env = getEnv()

  return new Response(JSON.stringify({
    ok: true,
    hasDb: Boolean(env.DB),
    hasMediaBucket: Boolean(env.MEDIA_BUCKET),
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
