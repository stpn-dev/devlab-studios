import type { APIRoute } from 'astro'
import { createCampaign, listCampaigns } from '../../../../../lead-engine/repositories/campaigns.js'
import { recordAuditEvent } from '../../../../../worker/repositories/auditLog.js'
import { createCampaignSchema } from '../../../../../lead-engine/schemas/index'
import { resolveFlags } from '../../../../../lead-engine/config/flags.js'
import { withOperationalFlags } from '../../../../../lead-engine/config/operationalFlags.js'
import {
  actorEmail,
  handleRoute,
  jsonResponse,
  readValidatedBody,
  requireDatabase,
} from '../../../../../lead-engine/schemas/route'

export const prerender = false

export const GET: APIRoute = async ({ url }) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const campaigns = await listCampaigns(database.env.DB, {
      status: url.searchParams.get('status'),
      countryCode: url.searchParams.get('countryCode'),
      limit: Number(url.searchParams.get('limit')) || 50,
    })

    return jsonResponse({ campaigns, flags: resolveFlags(await withOperationalFlags(database.env)) })
  })

export const POST: APIRoute = async (context) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const body = await readValidatedBody(context.request, createCampaignSchema)
    if (!body.ok) return body.response

    const email = actorEmail(context)
    // Always created as a draft with its schedule disarmed, whatever was sent —
    // see createCampaign. Activating is a separate, audited decision.
    const campaign = await createCampaign(database.env.DB, body.data, email)
    // createCampaign re-reads the row it just wrote; a null here would mean the
    // insert silently did nothing, which is worth surfacing rather than
    // dereferencing past.
    if (!campaign) return jsonResponse({ error: 'The campaign could not be created.' }, 500)

    await recordAuditEvent(database.env.DB, {
      actorEmail: email,
      action: 'lead_campaign.create',
      entityType: 'lead_campaign',
      entityId: campaign.id,
      metadata: { slug: campaign.slug, countryCode: campaign.countryCode },
    })

    return jsonResponse({ campaign }, 201)
  })
