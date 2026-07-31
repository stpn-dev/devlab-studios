export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json()
  return (body ?? {}) as Record<string, unknown>
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

export class NotFoundError extends Error {}
