export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

// Shared `catch (error) { ... }` body for every pickleball API route: this
// file is plain JS (no compile-time types), so narrowing `error` here once
// keeps every call site's TS `catch` free of `error: any` without repeating
// the same instanceof/status narrowing by hand in ~50 files.
export function apiErrorResponse(error) {
  const message = error instanceof Error ? error.message : 'Unexpected error.'
  const status = error instanceof Error && typeof error.status === 'number' ? error.status : 500
  return jsonResponse({ error: message }, status)
}

// Returns a 403 Forbidden, but first drains the request body -- use this
// instead of a bare `jsonResponse({ error: 'Forbidden.' }, 403)` on any
// permission-check early-return that hasn't yet read the request's body
// (i.e. a route that checks permission before parsing JSON, which is most
// of them).
//
// Why: `wrangler dev --local`'s keep-alive loopback proxy corrupts the NEXT
// request replayed over the same connection when a response ends without
// ever consuming the request's own body. This is not a hunch -- it was
// reproduced deterministically: running pickleball-fixed-pairs.spec.js five
// consecutive times against a fresh `wrangler dev --local` server, with the
// drain removed, crashed the dev server with "Error: Network connection
// lost." on 5 out of 5 runs (the crash surfaces on whichever request is
// next dispatched over the same connection -- a subsequent DELETE in that
// suite -- and cascades into ECONNREFUSED for every request after it). With
// the drain restored, the same suite passed cleanly on 2 consecutive runs.
// It is local-dev-only: production Workers requests are not proxied this
// way, so draining an already-empty or already-read body there is a
// harmless no-op.
export async function forbiddenResponse(request) {
  await request.arrayBuffer().catch(() => {})
  return jsonResponse({ error: 'Forbidden.' }, 403)
}

export function parseJsonField(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function nowIso() {
  return new Date().toISOString()
}
