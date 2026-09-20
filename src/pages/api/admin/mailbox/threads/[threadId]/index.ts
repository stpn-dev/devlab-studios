import type { APIRoute } from 'astro'
import { listAttachments, listMessagesForThread } from '../../../../../../mailbox/repositories/messages.js'
import { listOutboundForThread } from '../../../../../../mailbox/repositories/outbound.js'
import { getThread } from '../../../../../../mailbox/repositories/threads.js'
import { handleRoute, jsonResponse, notFound, requireDatabase } from '../../../../../../lead-engine/schemas/route'

export const prerender = false

/**
 * One thread, with its messages, their attachments and any queued replies.
 *
 * Attachments are fetched per message rather than in one query. The thread view
 * is bounded (a conversation, not an archive) and the alternative is a join
 * that returns one row per attachment per message, which the caller then has to
 * regroup — more code, for a page that renders tens of rows.
 *
 * Bodies are returned as stored: `bodyText` verbatim, `bodyHtml` already
 * sanitized at ingest. The client renders the HTML inside a sandboxed iframe
 * regardless, because one control is not a defence.
 */
export const GET: APIRoute = async ({ params, request }) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const db = database.env.DB
    const thread = await getThread(db, params.threadId!)
    if (!thread) return notFound(request, 'Thread not found.')

    const messages = await listMessagesForThread(db, thread.id)
    const withAttachments: Array<Record<string, unknown>> = []
    for (const message of messages) {
      if (!message) continue
      withAttachments.push({ ...message, attachments: await listAttachments(db, message.id) })
    }

    return jsonResponse({
      thread,
      messages: withAttachments,
      outbound: await listOutboundForThread(db, thread.id),
    })
  })
