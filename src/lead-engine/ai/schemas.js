/**
 * Schemas for Workers AI output.
 *
 * Every model answer is parsed and validated before it reaches the database or
 * a screen. A small instruction-tuned model will, given the chance, return
 * prose around its JSON, invent an enum value, return a confidence of "high"
 * instead of 0.8, or answer a different question than the one asked — and each
 * of those, stored unvalidated, becomes a claim about a real business on a
 * screen a human then acts on.
 *
 * Validation failure is NOT a retry-forever loop. It is recorded as
 * `invalid_output` on the AI run with the raw answer retained, and the lead
 * stays where it was. A model that cannot answer is a lead that does not get
 * reviewed, which is strictly better than a lead reviewed with fabricated
 * content.
 */

import { z } from 'zod'

/**
 * A confidence value.
 *
 * Coerced from a string because small models return `"0.8"` about as often as
 * `0.8`, and rejecting that would throw away otherwise-good answers. A word
 * like "high" is NOT coerced — there is no defensible mapping from it to a
 * number, and inventing one would put a number on the screen that the model
 * never gave.
 */
const confidence = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return value
}, z.number().min(0).max(1))

/** Bounded text. Every free-text field the model produces has a ceiling. */
const text = (max) => z.string().trim().min(1).max(max)
const optionalText = (max) => z.string().trim().max(max).optional().default('')

export const OPPORTUNITY_TYPES = Object.freeze([
  'manual_intake_automation',
  'scheduling_automation',
  'document_workflow_automation',
  'crm_integration',
  'customer_portal',
  'internal_operations_tooling',
  'website_and_conversion',
  'data_and_reporting',
  'none',
])

export const DEVLAB_SERVICES = Object.freeze([
  'workflow_automation',
  'custom_web_application',
  'systems_integration',
  'website_development',
  'data_and_reporting',
  'unclear',
])

/**
 * Opportunity review.
 *
 * `observed_problem` and `recommended_solution` are separated from
 * `inference_notes` deliberately, and the prompt is explicit about the
 * difference: the model must report what the public website SHOWS, and put
 * anything it is guessing about internal process into the inference field. The
 * lead detail screen renders them differently, so a human can see which is
 * which before repeating it in an email.
 */
export const opportunityReviewSchema = z.object({
  qualified: z.boolean(),
  confidence,
  opportunity_type: z.enum(OPPORTUNITY_TYPES),
  observed_problem: optionalText(600),
  recommended_solution: optionalText(600),
  devlab_service: z.enum(DEVLAB_SERVICES),
  outreach_angle: optionalText(400),
  reasoning_summary: optionalText(600),
  inference_notes: optionalText(400),
})

/**
 * Initial outreach draft.
 *
 * No pricing field, no metrics field, no case-study field. The schema is the
 * enforcement: a model that writes "we cut costs 40% for a similar firm" has
 * nowhere to put it, and the body itself is checked against the invention
 * guard in validate.js.
 */
export const outreachDraftSchema = z.object({
  subject: text(120),
  body: text(2_000),
  // What the draft claims to have observed. Cross-checked against the signals
  // actually extracted, so a draft resting on something we never saw is caught
  // before a human reads it.
  referenced_observations: z.array(text(200)).max(5).optional().default([]),
})

export const REPLY_INTENTS = Object.freeze([
  'interested',
  'technical_question',
  'pricing_question',
  'meeting_request',
  'not_now',
  'wrong_person',
  'not_interested',
  'unsubscribe',
  'out_of_office',
  'unknown',
])

export const RECOMMENDED_ACTIONS = Object.freeze([
  'send_reply',
  'answer_question',
  'propose_call',
  'send_pricing_context',
  'forward_to_right_person',
  'pause_and_follow_up_later',
  'stop_contact',
  'no_action',
])

export const replyAnalysisSchema = z.object({
  intent: z.enum(REPLY_INTENTS),
  summary: text(600),
  question_type: optionalText(120),
  questions_detected: z.array(text(300)).max(6).optional().default([]),
  important_new_information: optionalText(600),
  recommended_action: z.enum(RECOMMENDED_ACTIONS),
  needs_human_attention: z.boolean(),
  suggested_pipeline_stage: optionalText(40),
  recommended_strategy: optionalText(600),
})

export const replyDraftSchema = z.object({
  subject: text(150),
  body: text(2_500),
})

/**
 * Parses a model answer into structured data.
 *
 * Small models frequently wrap JSON in prose, a markdown fence, or both. This
 * recovers the JSON in those cases rather than discarding an otherwise-valid
 * answer — but it never repairs the JSON itself, because a "fixed" answer is no
 * longer the model's answer.
 *
 * @param {string} raw
 * @returns {{ ok: true, value: unknown }|{ ok: false, reason: string }}
 */
export function extractJson(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, reason: 'empty_response' }

  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced?.[1], value].filter(Boolean)

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    try {
      return { ok: true, value: JSON.parse(trimmed) }
    } catch {
      // Fall through to the brace-slice attempt below.
    }

    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) }
      } catch {
        // Not recoverable.
      }
    }
  }

  return { ok: false, reason: 'not_json' }
}

/**
 * Parses and validates in one step.
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {string} raw
 * @returns {{ ok: true, value: T }|{ ok: false, reason: string, issues?: unknown }}
 */
export function parseModelOutput(schema, raw) {
  const extracted = extractJson(raw)
  if (!extracted.ok) return extracted

  const result = schema.safeParse(extracted.value)
  if (!result.success) {
    return {
      ok: false,
      reason: 'schema_violation',
      issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    }
  }

  return { ok: true, value: result.data }
}
