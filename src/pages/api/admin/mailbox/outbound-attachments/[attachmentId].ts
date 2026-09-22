import type { APIRoute } from 'astro'
import { deleteUnclaimedAttachment } from '../../../../../mailbox/repositories/outboundAttachments.js'
import { handleRoute, jsonResponse, requireDatabase } from '../../../../../lead-engine/schemas/route'

export const prerender = false

/**
 * Removes a file the operator attached and then thought better of.
 *
 * Only while it is unclaimed. Once a message owns the attachment it is part of
 * what was transmitted, and deleting it would make our record disagree with
 * what the recipient is holding — the repository refuses that with a 409.
 *
 * The R2 object is deliberately left behind. Deleting it here would mean a
 * failed delete leaves a D1 row pointing at nothing, which is the worse of the
 * two inconsistencies; an orphaned object costs storage and is swept by the
 * `outbound_id IS NULL` index the migration adds for exactly this.
 */
export const DELETE: APIRoute = async ({ params }) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    return jsonResponse({ attachment: await deleteUnclaimedAttachment(database.env.DB, params.attachmentId!) })
  })
