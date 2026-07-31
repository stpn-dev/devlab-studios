/**
 * Minimal adapter so the existing Hono-shaped admin auth handlers
 * (src/worker/middleware/adminAuth.js) can be reused unchanged from
 * Astro API routes/middleware, rather than rewriting security-critical
 * password/session logic during the port. Only implements the subset
 * of the Hono context those handlers actually call.
 */
export function createHonoLikeContext(request, env, locals) {
  let parsedJson

  return {
    req: {
      header: (name) => request.headers.get(name),
      json: async () => {
        if (parsedJson === undefined) {
          parsedJson = await request.json()
        }
        return parsedJson
      },
      raw: request,
      url: request.url,
    },
    env,
    set(key, value) {
      locals[key] = value
    },
    get(key) {
      return locals[key]
    },
  }
}
