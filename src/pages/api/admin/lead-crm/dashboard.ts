import type { APIRoute } from 'astro'
import { getDashboard } from '../../../../lead-engine/services/dashboard.js'
import { handleRoute, jsonResponse, requireDatabase } from '../../../../lead-engine/schemas/route'

export const prerender = false

export const GET: APIRoute = async ({ url }) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    return jsonResponse(await getDashboard(database.env, { campaignId: url.searchParams.get('campaignId') }))
  })
