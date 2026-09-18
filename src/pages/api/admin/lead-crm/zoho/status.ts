import type { APIRoute } from 'astro'
import { z } from 'zod'
import { checkConnection } from '../../../../../lead-engine/zoho/client.js'
import { readZohoConfig } from '../../../../../lead-engine/zoho/oauth.js'
import { listSyncState } from '../../../../../lead-engine/repositories/syncState.js'
import { syncMailbox } from '../../../../../lead-engine/services/mailboxSync.js'
import { resolveFlags } from '../../../../../lead-engine/config/flags.js'
import { withOperationalFlags } from '../../../../../lead-engine/config/operationalFlags.js'
import { utcDateKey } from '../../../../../lead-engine/repositories/helpers.js'
import { recordAuditEvent } from '../../../../../worker/repositories/auditLog.js'
import {
  actorEmail,
  handleRoute,
  jsonResponse,
  readValidatedBody,
  requireDatabase,
} from '../../../../../lead-engine/schemas/route'

export const prerender = false

const syncActionSchema = z.object({ action: z.literal('sync_now') })

/**
 * Zoho integration status.
 *
 * Reports which variables are configured by NAME only. No token, no secret and
 * no account identifier value ever appears in this response — `readZohoConfig`
 * returns the missing KEYS, and the connection probe's failure detail goes
 * through `redactZohoError` before it gets here.
 */
export const GET: APIRoute = async () =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const env = await withOperationalFlags(database.env)
    const config = readZohoConfig(env)
    const flags = resolveFlags(env)
    const syncState = await listSyncState(database.env.DB)

    // The probe is only run when the integration is actually configured —
    // otherwise it would be a guaranteed failure reported as a health problem.
    const connection = config.isConfigured
      ? await checkConnection(env)
      : { ok: false, detail: `Not configured. Missing: ${config.missing.join(', ')}.`, code: 'zoho_not_configured' }

    const today = `${utcDateKey()}T00:00:00.000Z`
    const importedToday = await database.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM lead_messages WHERE provider = 'zoho' AND created_at >= ?",
    )
      .bind(today)
      .first<{ total: number }>()

    return jsonResponse({
      configured: config.isConfigured,
      missing: config.missing,
      // The mailbox address is operational configuration the operator owns and
      // already knows; the credentials are not returned in any form.
      mailbox: config.isConfigured ? config.userEmail : null,
      flags: { zohoMail: flags.zohoMail, zohoMailSync: flags.zohoMailSync },
      connection,
      syncState,
      messagesImportedToday: Number(importedToday?.total || 0),
    })
  })

/** Runs a mailbox sync immediately. */
export const POST: APIRoute = async (context) =>
  handleRoute(async () => {
    const database = requireDatabase()
    if (!database.ok) return database.response

    const body = await readValidatedBody(context.request, syncActionSchema)
    if (!body.ok) return body.response

    const result = await syncMailbox(database.env, {})

    await recordAuditEvent(database.env.DB, {
      actorEmail: actorEmail(context),
      action: 'lead_zoho.sync_now',
      entityType: 'lead_sync_state',
      entityId: null,
      metadata: { sent: result.sent?.status, inbox: result.inbox?.status },
    })

    return jsonResponse(result)
  })
