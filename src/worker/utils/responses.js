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
