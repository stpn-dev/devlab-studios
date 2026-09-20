import type { APIRoute } from 'astro'
import { z } from 'zod'
import { composeReply } from '../../../../../../mailbox/services/reply.js'
import { listOutboundForThread } from '../../../../../../mailbox/repositories/outbound.js'
import {
  actorEmail,
  handleRoute,
  jsonResponse,
  readValidatedBody,
  requireDatabase,
} from '../../../../../../lead-engine/schemas/route'

export const prerender = false

const replySchema = z.object({
  bodyText: z.string().trim().min(1).max(100_000),
  subject: z.string().trim().max(500).optional().nullable(),
  /** The specific message being answered. Defaults to the latest inbound one. */
  inReplyToMessageId: z.string().trim().max(100).optional().nullable(),
  /** Overrides the recipient, for a thread where the right address is not the sender. */
  toAddress: z.email().trim().max(320).optional().nullable(),
})

/**
 * Queues a reply, sent as hello@devlabconnect.com.
 *
 * NOTHING IS SENT HERE. This writes a row to `mailbox_outbound`; the configured
 * external sender collects it from `/api/mailbox/outbox` and submits it to the
 * private Postfix instance. There is still no SMTP client in this codebase, and
 * the Email Worker cannot originate arbitrary mail either — that boundary is
 * the reason every compliance gate stays on this side of it, where it is
 * testable. Suppression is re-checked inside `composeReply` at this moment,
 * not at the moment the thread arrived.
 */
export const POST: APIRoute = async (context) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const body = await readValidatedBody(context.request, replySchema)
    if (!body.ok) return body.response

    const queued = await composeReply(database.env, {
      threadId: context.params.threadId!,
      bodyText: body.data.bodyText,
      subject: body.data.subject ?? null,
      inReplyToMessageId: body.data.inReplyToMessageId ?? null,
      toAddress: body.data.toAddress ?? null,
      actorEmail: actorEmail(context),
    })

    return jsonResponse({
      queued,
      outbound: await listOutboundForThread(database.env.DB, context.params.threadId!),
      // Stated in the payload because this is the single most misreadable
      // thing about the screen: pressing Reply does not send.
      sent: false,
      instruction: 'Queued. The configured external sender transmits it on its next run.',
    })
  })
