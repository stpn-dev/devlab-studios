/**
 * The Workers AI call boundary.
 *
 * One place that talks to the model, so retry policy, response-shape handling,
 * usage accounting and the audit record cannot drift between the four tasks.
 *
 * Response-shape handling is not incidental. Workers AI models do not agree on
 * a response shape, and the binding returns the payload unwrapped while the
 * REST API nests it under `result` — reading only one of these is how a working
 * model looks exactly like a broken one. The Insights digest was shipped with
 * that bug and spent a day's neuron allocation producing summaries it then
 * discarded; `readText` below handles every shape for the same reason
 * digest/summarize.js now does.
 */

import { AI } from '../config/defaults.js'
import { parseModelOutput } from './schemas.js'

/**
 * Reads text out of whatever shape the model answered in.
 *
 * @param {unknown} result
 * @returns {string}
 */
export function readText(result) {
  if (typeof result === 'string') return result

  const candidates = [
    result?.response,
    result?.choices?.[0]?.message?.content,
    result?.choices?.[0]?.text,
    result?.result?.response,
    result?.result?.choices?.[0]?.message?.content,
    result?.result?.choices?.[0]?.text,
  ]

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim()) || ''
}

/**
 * Reads usage, when the model reports it.
 *
 * Every field is optional. Usage is telemetry for the cost screen, never
 * control flow — the authoritative budget is the review COUNT, which does not
 * depend on the model volunteering anything.
 *
 * @param {unknown} result
 */
export function readUsage(result) {
  const usage = result?.usage || result?.result?.usage || {}
  const toNumber = (value) => (Number.isFinite(value) ? value : null)
  return {
    inputTokens: toNumber(usage.prompt_tokens ?? usage.input_tokens),
    outputTokens: toNumber(usage.completion_tokens ?? usage.output_tokens),
    neurons: toNumber(usage.neurons),
  }
}

export class AiUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiUnavailableError'
    this.status = 503
  }
}

/**
 * Runs one task against the model and validates its answer.
 *
 * Retries ONCE on an unparseable or schema-violating answer, with a stronger
 * reminder appended. One retry, not a loop: a small model that answered in
 * prose once will usually correct itself when told to, and will rarely correct
 * itself on a third attempt — so further retries mostly buy neuron spend.
 *
 * Never throws for a model failure. Returns an outcome, because "the model was
 * unavailable" and "the model answered nonsense" are both ordinary branches
 * that leave the lead exactly where it was.
 *
 * @param {{ AI?: { run: Function } }} env
 * @param {{
 *   task: string, systemPrompt: string, userPrompt: string, promptVersion: string,
 *   schema: import('zod').ZodType, model?: string, maxTokens?: number, temperature?: number
 * }} request
 * @returns {Promise<{
 *   status: 'ok'|'invalid_output'|'failed'|'skipped',
 *   value: unknown|null, rawOutput: string|null, error: string|null,
 *   model: string, promptVersion: string, usage: object, durationMs: number, attempts: number
 * }>}
 */
export async function runAiTask(env, request) {
  const model = request.model || AI.model
  const maxTokens = request.maxTokens || AI.maxTokens[request.task] || 600
  const temperature = request.temperature ?? AI.temperature[request.task] ?? 0.2

  const outcome = {
    status: 'failed',
    value: null,
    rawOutput: null,
    error: null,
    model,
    promptVersion: request.promptVersion,
    usage: { inputTokens: null, outputTokens: null, neurons: null },
    durationMs: 0,
    attempts: 0,
  }

  if (!env?.AI) {
    outcome.status = 'skipped'
    outcome.error = 'Workers AI binding is not available.'
    return outcome
  }

  const startedAt = Date.now()
  let lastRaw = ''
  let lastReason = null

  for (let attempt = 0; attempt <= AI.maxParseRetries; attempt += 1) {
    outcome.attempts = attempt + 1

    const messages = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ]

    if (attempt > 0) {
      // The correction is appended as a user turn rather than folded into the
      // system prompt, so the versioned prompt text stays exactly what the
      // audit record says it was.
      messages.push({
        role: 'user',
        content:
          'Your previous answer could not be parsed. Reply with ONLY a single valid JSON object matching the required keys. No prose, no markdown fence, no explanation.',
      })
    }

    let result
    try {
      result = await env.AI.run(model, { messages, max_tokens: maxTokens, temperature })
    } catch (error) {
      // Workers AI hard-fails once the daily allocation is exhausted, so this
      // is an ordinary branch and not an exceptional one.
      outcome.status = 'failed'
      outcome.error = error instanceof Error ? error.message : 'Workers AI call failed.'
      outcome.durationMs = Date.now() - startedAt
      return outcome
    }

    const usage = readUsage(result)
    // Accumulated across attempts: a retry costs real neurons and the cost
    // screen must show them.
    outcome.usage = {
      inputTokens: (outcome.usage.inputTokens ?? 0) + (usage.inputTokens ?? 0) || usage.inputTokens,
      outputTokens: (outcome.usage.outputTokens ?? 0) + (usage.outputTokens ?? 0) || usage.outputTokens,
      neurons: (outcome.usage.neurons ?? 0) + (usage.neurons ?? 0) || usage.neurons,
    }

    const raw = readText(result)
    // Only overwrite when there is something to keep: an empty retry must not
    // erase the informative first answer, which is the one a human needs to see
    // on an invalid_output run.
    if (raw) lastRaw = raw

    if (!raw) {
      lastReason = 'empty_response'
      continue
    }

    const parsed = parseModelOutput(request.schema, raw)
    if (parsed.ok) {
      outcome.status = 'ok'
      outcome.value = parsed.value
      outcome.durationMs = Date.now() - startedAt
      return outcome
    }

    lastReason = parsed.reason
    outcome.error = parsed.issues ? `${parsed.reason}: ${JSON.stringify(parsed.issues).slice(0, 300)}` : parsed.reason
  }

  outcome.status = 'invalid_output'
  outcome.rawOutput = lastRaw || null
  outcome.error = outcome.error || lastReason || 'unparseable_response'
  outcome.durationMs = Date.now() - startedAt
  return outcome
}
