/**
 * Shared helpers for the Lead CRM API routes.
 *
 * Authentication is NOT done here and is not done per route. Every path under
 * `/api/admin/` is gated by `requireAdmin` in src/middleware.ts before the
 * route module runs, and `locals.adminEmail` is already populated by the time
 * anything below executes. Re-checking would be duplicated security logic that
 * could drift from the real gate — the correct place to verify it is a test
 * asserting the middleware covers this prefix, which is what
 * src/lead-engine/schemas/route.test.ts does.
 */

import type { APIContext } from 'astro'
import { z } from 'zod'
import { getEnv } from '../../lib/env'
import { adminErrorResponse, drainRequestBody, jsonResponse } from '../../lib/http'
import { parseBody } from './index'
import { FeatureDisabledError } from '../config/flags.js'

/**
 * The env, with a guard for the one binding every route needs.
 *
 * 503 rather than 500: a missing D1 binding is a deployment configuration
 * problem, not a request problem, and the status should say so.
 */
export function requireDatabase(): { ok: true; env: Env } | { ok: false; response: Response } {
  const env = getEnv()
  if (!env.DB) {
    return { ok: false, response: jsonResponse({ error: 'D1 DB binding is not configured.' }, 503) }
  }
  return { ok: true, env }
}

/** The signed-in admin's email, for audit and activity attribution. */
export function actorEmail(context: APIContext): string | null {
  return (context.locals as { adminEmail?: string }).adminEmail ?? null
}

/**
 * Reads and validates a JSON body.
 *
 * Returns the `{ error, issues, field }` shape the existing admin API client
 * already understands, so a validation failure attaches to the input that
 * caused it instead of becoming a page-level banner.
 */
export async function readValidatedBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: jsonResponse({ error: 'A JSON body is required.' }, 400) }
  }

  const parsed = parseBody(schema, raw ?? {})
  if (parsed.ok) return { ok: true, data: parsed.data }

  return {
    ok: false,
    response: jsonResponse({ error: parsed.message, field: parsed.field, issues: parsed.issues }, 422),
  }
}

/**
 * Wraps a route handler with the error translation the rest of the admin API
 * uses, plus one addition: a disabled feature answers 503 naming the exact var
 * to set, rather than a generic failure.
 */
export async function handleRoute(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof FeatureDisabledError) {
      return jsonResponse({ error: error.message, flag: error.flagKey }, 503)
    }
    return adminErrorResponse(error)
  }
}

/**
 * A 404 that drains the request body first.
 *
 * See src/lib/http.ts: an early return that answers without reading the body
 * corrupts the NEXT request over the same keep-alive connection under
 * `wrangler dev --local`.
 */
export async function notFound(request: Request, message = 'Not found.'): Promise<Response> {
  await drainRequestBody(request)
  return jsonResponse({ error: message }, 404)
}

export { jsonResponse }
