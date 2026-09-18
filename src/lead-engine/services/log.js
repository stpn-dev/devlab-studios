/**
 * Structured logging for the Lead Intelligence Engine.
 *
 * `console.log` with a JSON payload, which is how logging reaches
 * `wrangler tail` on Workers — the same approach the Insights digest and the
 * pickleball Durable Object already use.
 *
 * The redaction list is not decoration. Every field named below has, in some
 * system somewhere, ended up in a log aggregator: OAuth tokens because an error
 * body echoed the request, cookies because someone logged the whole Request,
 * API keys because someone logged the whole env. Redaction happens here rather
 * than at each call site, because the call site that forgets is exactly the one
 * that leaks.
 */

/** Keys whose values are never logged, matched case-insensitively as substrings. */
const REDACTED_KEYS = [
  'token', 'secret', 'password', 'passwd', 'authorization', 'auth', 'cookie',
  'apikey', 'api_key', 'client_secret', 'refresh_token', 'access_token',
  'credential', 'signature', 'session',
]

function isRedactedKey(key) {
  const lower = String(key).toLowerCase()
  return REDACTED_KEYS.some((needle) => lower.includes(needle))
}

/**
 * Recursively redacts a payload.
 *
 * Bounded in depth and breadth: a log line is not a debugger, and an
 * accidentally-passed deep object should cost a truncated log rather than the
 * request's CPU budget.
 */
function redact(value, depth = 0) {
  if (depth > 4) return '[truncated]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1))

  if (typeof value === 'object') {
    const output = {}
    for (const [key, nested] of Object.entries(value).slice(0, 40)) {
      output[key] = isRedactedKey(key) ? '[redacted]' : redact(nested, depth + 1)
    }
    return output
  }

  return String(value)
}

/**
 * Writes one structured log line.
 *
 * @param {string} event
 * @param {Record<string, unknown>} [fields] correlation_id, campaign_id,
 *   lead_id, workflow_instance, stage, provider, result, duration_ms
 */
export function logEvent(event, fields = {}) {
  console.log(JSON.stringify({ event: `lead_engine.${event}`, ...redact(fields) }))
}

/**
 * A logger bound to a correlation id and the ids that identify a run.
 *
 * Every background operation creates one, so a single campaign run's lines can
 * be filtered out of `wrangler tail` without grepping for a company name.
 *
 * @param {{ correlationId?: string, campaignId?: string, leadId?: string,
 *           workflowInstance?: string }} [context]
 */
export function createLogger(context = {}) {
  const base = {
    correlation_id: context.correlationId || crypto.randomUUID(),
    ...(context.campaignId ? { campaign_id: context.campaignId } : {}),
    ...(context.leadId ? { lead_id: context.leadId } : {}),
    ...(context.workflowInstance ? { workflow_instance: context.workflowInstance } : {}),
  }

  return {
    correlationId: base.correlation_id,
    log: (event, fields = {}) => logEvent(event, { ...base, ...fields }),
    child: (extra) => createLogger({ ...context, ...extra, correlationId: base.correlation_id }),
  }
}

/**
 * Times an operation and logs its outcome either way.
 *
 * The `catch` re-throws. This is instrumentation, not error handling — a
 * timing helper that swallowed failures would turn every unhandled error into a
 * silent success.
 *
 * @template T
 * @param {{ log: Function }} logger
 * @param {string} event
 * @param {Record<string, unknown>} fields
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
export async function timed(logger, event, fields, operation) {
  const startedAt = Date.now()
  try {
    const result = await operation()
    logger.log(event, { ...fields, result: 'ok', duration_ms: Date.now() - startedAt })
    return result
  } catch (error) {
    logger.log(event, {
      ...fields,
      result: 'error',
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'unknown',
    })
    throw error
  }
}
