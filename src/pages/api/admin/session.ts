import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ locals }) => {
  return new Response(JSON.stringify({
    ok: true,
    email: locals.adminEmail,
    role: locals.adminRole || 'admin',
    mode: locals.adminAuthMode || 'cloudflare-access',
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
