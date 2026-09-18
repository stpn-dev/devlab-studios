import type { APIRoute } from 'astro'
import { pushDraftToZoho, recordZohoOpened } from '../../../../../../lead-engine/services/zohoDraft.js'
import { recordAuditEvent } from '../../../../../../worker/repositories/auditLog.js'
import { actorEmail, handleRoute, jsonResponse, requireDatabase } from '../../../../../../lead-engine/schemas/route'

export const prerender = false

/**
 * Saves the draft into the Zoho Drafts folder.
 *
 * IT DOES NOT SEND, and there is no route in this application that does. The
 * response carries the Zoho URL so the operator can open their mailbox, read
 * the draft, edit it if they want to, and press Send themselves.
 */
export const POST: APIRoute = async (context) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const email = actorEmail(context)
    const result = await pushDraftToZoho(database.env, context.params.id!, { actorEmail: email })

    await recordAuditEvent(database.env.DB, {
      actorEmail: email,
      action: 'lead_draft.zoho_draft_created',
      entityType: 'lead_draft',
      entityId: context.params.id!,
      metadata: { status: result.status, zohoDraftId: result.zohoDraftId },
    })

    return jsonResponse({
      ...result,
      // Said explicitly in the response, because this is the one place an
      // operator could reasonably assume otherwise.
      sent: false,
      instruction: 'The message is saved in Zoho Drafts. Open Zoho, review it, and send it yourself.',
    })
  })

/** Records that the operator opened Zoho, and returns where to go. */
export const PUT: APIRoute = async (context) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    return jsonResponse(
      await recordZohoOpened(database.env, context.params.id!, { actorEmail: actorEmail(context) }),
    )
  })
