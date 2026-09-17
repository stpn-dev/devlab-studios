/**
 * Consumes and discards a request body.
 *
 * Call this on any early-return path that answers a request WITHOUT reading
 * its body (a 401 from the admin gate, a 404 before validation, a POST whose
 * handler needs no input). `wrangler dev --local`'s keep-alive loopback proxy
 * corrupts the NEXT request replayed over the same connection when a response
 * ends with an unread body, which surfaces as the dev server dying with
 * "Network connection lost" and every later request failing with
 * ECONNREFUSED. See src/worker/utils/responses.js's forbiddenResponse() for
 * the reproduction that established this. Harmless in production.
 */
export async function drainRequestBody(request: Request): Promise<void> {
  await request.arrayBuffer().catch(() => {})
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json()
  return (body ?? {}) as Record<string, unknown>
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

export class NotFoundError extends Error {}

/**
 * Shared `catch (error) { ... }` body for admin write routes.
 *
 * Splits deliberate failures from unexpected ones, because they want opposite
 * treatment. An error carrying an explicit 4xx `status` was thrown on purpose
 * and its message is written FOR the admin — which field failed validation,
 * which conflict blocked the write — so it passes through verbatim. An
 * unexpected 5xx is the opposite: its message is whatever D1 or the runtime
 * happened to produce, which tells the admin nothing actionable while leaking
 * internal query text and table names. Those are logged server-side instead
 * (console.error being how logging reaches `wrangler tail` on Workers — see
 * worker/pickleball/SessionCoordinatorDO.ts) and answered generically.
 */
export function adminErrorResponse(
  error: unknown,
  fallback = 'Something went wrong while saving. Please try again.',
): Response {
  const rawStatus =
    error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : 500
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500

  if (status < 500) {
    const message = error instanceof Error ? error.message : ''
    return jsonResponse({ error: message || fallback }, status)
  }

  console.error('[admin] unhandled error', error)
  return jsonResponse({ error: fallback }, 500)
}
