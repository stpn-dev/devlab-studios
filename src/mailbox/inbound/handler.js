/**
 * The Cloudflare Email Worker entry point.
 *
 * WHERE THIS RUNS. In the SAME Worker as the public site and the Admin CMS.
 * `ExportedHandler` accepts `email` alongside `fetch`, `scheduled` and `queue`
 * (verified against the installed @cloudflare/workers-types, not assumed), and
 * src/worker.ts is already a hand-maintained entrypoint because the Durable
 * Objects needed one. A second Worker would mean a second deployment, a second
 * copy of the D1 and R2 bindings, and a second thing to remember to deploy.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It does not `forward()`. Delivery terminates here, in our own storage.
 *     That is what keeps `include:_spf.mx.cloudflare.net` out of our SPF
 *     record: Cloudflare only needs to be an authorised SENDER for our domain
 *     if it re-sends mail as us, and forwarding is the thing that would make it
 *     do so. See docs/lead-engine/mailbox.md on the SPF decision.
 *   - It does not `reply()`. Cloudflare's reply is constrained to answering the
 *     message currently being handled, once, and only when it passed DMARC. A
 *     reply written by a person hours later cannot use it, so replies go
 *     through Postfix like every other outbound message and no sending
 *     capability enters this codebase.
 *   - It does not `setReject()` on our own failures. Rejecting returns a
 *     PERMANENT SMTP error, which tells a legitimate sender their message can
 *     never be delivered — a lie, when the real problem is that our database
 *     was briefly unavailable.
 */

import { ingestEmail } from './ingest.js'
import { createLogger } from '../../lead-engine/services/log.js'

/**
 * Handles one inbound message.
 *
 * @param {ForwardableEmailMessage} message
 * @param {Env} env
 * @param {ExecutionContext} ctx
 */
export async function handleEmail(message, env, ctx) {
  const correlationId = crypto.randomUUID()
  const logger = createLogger({ correlationId })

  if (!env?.DB) {
    // Throwing rather than rejecting, so the sending MTA queues and retries
    // instead of being told the address does not work.
    logger.log('mailbox.ingest', { result: 'no_database' })
    throw new Error('Mailbox ingest failed: the D1 binding is not configured.')
  }

  try {
    const result = await ingestEmail(env, message, { correlationId })

    // Nothing is awaited after this point that the delivery depends on. The
    // message is durable; anything slower can finish after we acknowledge.
    void ctx
    return result
  } catch (error) {
    logger.log('mailbox.ingest', {
      result: 'crashed',
      error: error instanceof Error ? error.message : 'unknown',
    })

    // Re-thrown on purpose. Cloudflare's documentation does not specify whether
    // an `email()` handler that throws produces a temporary or a permanent SMTP
    // failure, and that distinction matters — so it is on the acceptance
    // checklist to observe rather than to assume. Either way, a throw is more
    // honest than swallowing the error and telling the sender we accepted a
    // message we did not store.
    throw error
  }
}
