import type { APIRoute } from 'astro'
import { handleAdminLogout } from '../../../worker/middleware/adminAuth.js'
import { createHonoLikeContext } from '../../../lib/honoShim'
import { getEnv } from '../../../lib/env'

export const POST: APIRoute = async ({ request, locals }) => {
  const honoContext = createHonoLikeContext(request, getEnv(), locals)
  return handleAdminLogout(honoContext)
}
