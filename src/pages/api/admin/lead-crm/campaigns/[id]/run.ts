import type { APIRoute } from 'astro'
import { runCampaignDiscovery } from '../../../../../../lead-engine/services/discovery.js'
import { recordAuditEvent } from '../../../../../../worker/repositories/auditLog.js'
import { runCampaignSchema } from '../../../../../../lead-engine/schemas/index'
import {
  actorEmail,
  handleRoute,
  jsonResponse,
  readValidatedBody,
  requireDatabase,
} from '../../../../../../lead-engine/schemas/route'

export const prerender = false

/**
 * Runs discovery for one campaign, now.
 *
 * The manual path, and how a campaign is exercised before its schedule is ever
 * armed. `dryRun` discovers and dedupes without enqueueing a single crawl, so
 * candidate quality can be inspected at no cost to anybody else's servers.
 */
export const POST: APIRoute = async (context) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const body = await readValidatedBody(context.request, runCampaignSchema)
    if (!body.ok) return body.response

    const email = actorEmail(context)
    const result = await runCampaignDiscovery(database.env, context.params.id!, {
      limit: body.data.limit,
      enqueueResearch: !body.data.dryRun,
      actorEmail: email,
    })

    await recordAuditEvent(database.env.DB, {
      actorEmail: email,
      action: 'lead_campaign.run',
      entityType: 'lead_campaign',
      entityId: context.params.id!,
      metadata: { dryRun: body.data.dryRun, created: result.created, duplicates: result.duplicates },
    })

    return jsonResponse(result)
  })
