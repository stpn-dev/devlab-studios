/**
 * The Workers AI audit ledger.
 *
 * Every call is recorded, successful or not. This is simultaneously the cost
 * ledger, the prompt-version record and the debugging trail — a model answer
 * that cannot be traced back to the prompt that produced it is not auditable,
 * which is why `prompt_version` is NOT NULL and names a file in Git.
 *
 * Raw model output is retained ONLY when validation rejected it. That is the
 * one case where a human needs to see what the model actually said; on the
 * happy path the validated structured result is both smaller and more useful.
 */

import { AI } from '../config/defaults.js'
import { bounded, buildWhere, clampLimit, newId, nowIso, parseJsonField, utcDateKey } from './helpers.js'

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    leadId: row.lead_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    task: row.task,
    model: row.model,
    promptVersion: row.prompt_version,
    status: row.status,
    result: parseJsonField(row.result_json, null),
    confidence: row.confidence,
    rawOutput: row.raw_output,
    errorMessage: row.error_message,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    neurons: row.neurons,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ leadId?, conversationId?, messageId?, task, model, promptVersion, status,
 *           result?, confidence?, rawOutput?, errorMessage?, inputTokens?, outputTokens?,
 *           neurons?, durationMs? }} run
 */
export async function recordAiRun(db, run) {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO lead_ai_runs
         (id, lead_id, conversation_id, message_id, task, model, prompt_version, status,
          result_json, confidence, raw_output, error_message, input_tokens, output_tokens,
          neurons, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      run.leadId ?? null,
      run.conversationId ?? null,
      run.messageId ?? null,
      run.task,
      run.model,
      run.promptVersion,
      run.status,
      run.result ? JSON.stringify(run.result) : null,
      Number.isFinite(run.confidence) ? run.confidence : null,
      // Only on rejection, and bounded: an unbounded raw field is how one
      // pathological model answer writes megabytes into a table the admin then
      // has to render.
      run.status === 'invalid_output' && run.rawOutput
        ? bounded(run.rawOutput, AI.rawOutputRetentionChars)
        : null,
      run.errorMessage ? bounded(run.errorMessage, 500) : null,
      run.inputTokens ?? null,
      run.outputTokens ?? null,
      Number.isFinite(run.neurons) ? run.neurons : null,
      run.durationMs ?? null,
      nowIso(),
    )
    .run()

  return id
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function getLatestAiRun(db, leadId, task) {
  const row = await db
    .prepare(
      `SELECT * FROM lead_ai_runs
       WHERE lead_id = ? AND task = ? AND status = 'ok'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(leadId, task)
    .first()
  return mapRow(row)
}

/** @param {import('@cloudflare/workers-types').D1Database} db */
export async function listAiRuns(db, filters = {}) {
  const { clause, bindings } = buildWhere([
    ['lead_id = ?', filters.leadId ?? null],
    ['task = ?', filters.task ?? null],
    ['status = ?', filters.status ?? null],
    ['created_at >= ?', filters.since ?? null],
  ])

  const result = await db
    .prepare(`SELECT * FROM lead_ai_runs ${clause} ORDER BY created_at DESC LIMIT ?`)
    .bind(...bindings, clampLimit(filters.limit, 50, 200))
    .all()

  return (result.results || []).map(mapRow)
}

/**
 * Today's AI spend, as measured.
 *
 * Neurons are advisory: not every model reports usage, so this bounds what we
 * can MEASURE rather than what we can spend. The authoritative daily cap is
 * the review COUNT in `lead_usage_daily`, which does not depend on the model
 * volunteering anything. See docs/lead-engine/workers-ai.md.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function getTodayAiSpend(db) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS runs,
              COALESCE(SUM(neurons), 0) AS neurons,
              SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_runs,
              SUM(CASE WHEN status = 'invalid_output' THEN 1 ELSE 0 END) AS invalid_runs,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs
       FROM lead_ai_runs WHERE created_at >= ?`,
    )
    .bind(`${utcDateKey()}T00:00:00.000Z`)
    .first()

  return {
    runs: Number(row?.runs || 0),
    neurons: Number(row?.neurons || 0),
    okRuns: Number(row?.ok_runs || 0),
    invalidRuns: Number(row?.invalid_runs || 0),
    failedRuns: Number(row?.failed_runs || 0),
  }
}
