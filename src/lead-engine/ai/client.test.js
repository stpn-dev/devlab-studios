import { describe, expect, it, vi } from 'vitest'
import { readText, readUsage, runAiTask } from './client.js'
import { extractJson, opportunityReviewSchema, parseModelOutput, replyAnalysisSchema } from './schemas.js'
import { findDisallowedLinks, findInventedClaims, findUnsupportedObservations, validateGeneratedMessage } from './validate.js'
import { SYSTEM_PROMPT } from './prompts/opportunityReview.v1.js'

const VALID_REVIEW = {
  qualified: true,
  confidence: 0.8,
  opportunity_type: 'manual_intake_automation',
  observed_problem: 'The public website asks visitors to call the office to begin.',
  recommended_solution: 'An online intake form that routes submissions automatically.',
  devlab_service: 'workflow_automation',
  outreach_angle: 'Open on the call-the-office intake step.',
  reasoning_summary: 'Manual intake language with no scheduling detected.',
  inference_notes: '',
}

/** A single response repeats; an array is consumed in order and then repeats its last entry. */
function aiStub(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses]
  let last = queue[queue.length - 1]
  return {
    AI: {
      run: vi.fn(async () => {
        if (queue.length > 0) last = queue.shift()
        return last
      }),
    },
  }
}

describe('readText', () => {
  it('reads every response shape Workers AI models produce', () => {
    expect(readText('plain')).toBe('plain')
    expect(readText({ response: 'binding shape' })).toBe('binding shape')
    expect(readText({ choices: [{ message: { content: 'chat shape' } }] })).toBe('chat shape')
    expect(readText({ choices: [{ text: 'completion shape' }] })).toBe('completion shape')
    expect(readText({ result: { response: 'rest shape' } })).toBe('rest shape')
  })

  it('returns empty for an unrecognized shape rather than throwing', () => {
    expect(readText({ unexpected: true })).toBe('')
    expect(readText(null)).toBe('')
  })
})

describe('readUsage', () => {
  it('reads usage from either nesting', () => {
    expect(readUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, neurons: 1.5 } })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      neurons: 1.5,
    })
    expect(readUsage({ result: { usage: { input_tokens: 3 } } }).inputTokens).toBe(3)
  })

  it('returns nulls when the model reports nothing', () => {
    expect(readUsage({})).toEqual({ inputTokens: null, outputTokens: null, neurons: null })
  })
})

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('recovers JSON from a markdown fence', () => {
    expect(extractJson('```json\n{"a":1}\n```').value).toEqual({ a: 1 })
  })

  it('recovers JSON wrapped in prose', () => {
    expect(extractJson('Sure! Here is the result:\n{"a":1}\nHope that helps.').value).toEqual({ a: 1 })
  })

  it('refuses rather than repairing malformed JSON', () => {
    expect(extractJson('{"a": 1,}').ok).toBe(false)
    expect(extractJson('not json at all').ok).toBe(false)
    expect(extractJson('').reason).toBe('empty_response')
  })
})

describe('parseModelOutput', () => {
  it('accepts a valid answer', () => {
    const result = parseModelOutput(opportunityReviewSchema, JSON.stringify(VALID_REVIEW))
    expect(result.ok).toBe(true)
    expect(result.value.opportunity_type).toBe('manual_intake_automation')
  })

  it('coerces a numeric confidence supplied as a string', () => {
    const result = parseModelOutput(opportunityReviewSchema, JSON.stringify({ ...VALID_REVIEW, confidence: '0.65' }))
    expect(result.ok).toBe(true)
    expect(result.value.confidence).toBe(0.65)
  })

  it('refuses a word where a confidence number was required', () => {
    const result = parseModelOutput(opportunityReviewSchema, JSON.stringify({ ...VALID_REVIEW, confidence: 'high' }))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('schema_violation')
  })

  it('refuses an invented enum value', () => {
    const result = parseModelOutput(
      opportunityReviewSchema,
      JSON.stringify({ ...VALID_REVIEW, opportunity_type: 'blockchain_transformation' }),
    )
    expect(result.ok).toBe(false)
    expect(result.issues[0].path).toBe('opportunity_type')
  })

  it('refuses a confidence outside 0..1', () => {
    expect(parseModelOutput(opportunityReviewSchema, JSON.stringify({ ...VALID_REVIEW, confidence: 95 })).ok).toBe(false)
  })

  it('refuses a missing required field', () => {
    const { qualified, ...incomplete } = VALID_REVIEW
    expect(qualified).toBe(true)
    expect(parseModelOutput(opportunityReviewSchema, JSON.stringify(incomplete)).ok).toBe(false)
  })

  it('validates a reply analysis', () => {
    const result = parseModelOutput(
      replyAnalysisSchema,
      JSON.stringify({
        intent: 'technical_question',
        summary: 'They asked whether we integrate with HubSpot.',
        question_type: 'integration',
        questions_detected: ['Can you integrate with HubSpot?'],
        important_new_information: 'They already use HubSpot.',
        recommended_action: 'answer_question',
        needs_human_attention: false,
        suggested_pipeline_stage: 'CONVERSATION',
        recommended_strategy: 'Explain the integration approach.',
      }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('runAiTask', () => {
  const request = {
    task: 'opportunity_review',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: '<<<LEAD>>>{}<<<END>>>',
    promptVersion: 'opportunity_review.v1',
    schema: opportunityReviewSchema,
  }

  it('skips cleanly when the AI binding is absent', async () => {
    const result = await runAiTask({}, request)
    expect(result.status).toBe('skipped')
    expect(result.value).toBeNull()
  })

  it('returns a validated result', async () => {
    const env = aiStub({ response: JSON.stringify(VALID_REVIEW), usage: { neurons: 2 } })
    const result = await runAiTask(env, request)

    expect(result.status).toBe('ok')
    expect(result.value.qualified).toBe(true)
    expect(result.usage.neurons).toBe(2)
    expect(result.attempts).toBe(1)
  })

  it('retries once on an unparseable answer and accepts the correction', async () => {
    const env = aiStub([{ response: 'Certainly! Let me explain...' }, { response: JSON.stringify(VALID_REVIEW) }])
    const result = await runAiTask(env, request)

    expect(result.status).toBe('ok')
    expect(result.attempts).toBe(2)
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })

  it('gives up after one retry rather than looping', async () => {
    const env = aiStub({ response: 'still not JSON' })
    const result = await runAiTask(env, request)

    expect(result.status).toBe('invalid_output')
    expect(result.rawOutput).toBe('still not JSON')
    expect(env.AI.run).toHaveBeenCalledTimes(2)
  })

  it('records a schema violation as invalid_output, keeping the raw answer', async () => {
    const env = aiStub({ response: JSON.stringify({ ...VALID_REVIEW, opportunity_type: 'nonsense' }) })
    const result = await runAiTask(env, request)

    expect(result.status).toBe('invalid_output')
    expect(result.rawOutput).toContain('nonsense')
    expect(result.error).toContain('schema_violation')
  })

  it('reports an allocation failure as failed, without retrying', async () => {
    const env = { AI: { run: vi.fn(async () => { throw new Error('Daily neuron allocation exceeded') }) } }
    const result = await runAiTask(env, request)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('allocation')
    expect(env.AI.run).toHaveBeenCalledTimes(1)
  })

  it('sends the versioned system prompt verbatim on the first attempt', async () => {
    const env = aiStub({ response: JSON.stringify(VALID_REVIEW) })
    await runAiTask(env, request)

    const [, body] = env.AI.run.mock.calls[0]
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT)
    expect(body.messages).toHaveLength(2)
  })
})

describe('findInventedClaims', () => {
  it('catches a price', () => {
    expect(findInventedClaims('We can do this for $2,500.').map((v) => v.code)).toContain('PRICE_CLAIM')
    expect(findInventedClaims('Our rate is competitive.').map((v) => v.code)).toContain('PRICE_CLAIM')
  })

  it('catches a fabricated metric', () => {
    expect(findInventedClaims('We cut their intake time by 40%.').map((v) => v.code)).toContain('METRIC_CLAIM')
  })

  it('catches a past-client reference', () => {
    expect(findInventedClaims('We worked with a similar firm in Dallas.').map((v) => v.code)).toContain('CLIENT_CLAIM')
  })

  it('catches a claim about internal process', () => {
    const violations = findInventedClaims('Your team manually processes every owner inquiry.')
    expect(violations.map((v) => v.code)).toContain('INTERNAL_KNOWLEDGE_CLAIM')
  })

  it('catches a fabricated prior conversation', () => {
    expect(findInventedClaims('Following up on our call last week.').map((v) => v.code)).toContain('FALSE_PRETEXT')
  })

  it('accepts a properly hedged observation', () => {
    const good =
      'I noticed your contact page asks visitors to call the office to start a service request. ' +
      'That often means inquiries are handled one at a time. Would an online intake form be useful?'
    expect(findInventedClaims(good)).toEqual([])
  })

  it('reports an excerpt so a human can see what was claimed', () => {
    const [violation] = findInventedClaims('Typically we charge $3,000 for this.')
    expect(violation.excerpt).toContain('$3,000')
  })
})

describe('findDisallowedLinks', () => {
  it('flags a link the model invented', () => {
    expect(findDisallowedLinks('See https://www.devlabstudios.com/case-studies for more.')).toEqual([
      'https://www.devlabstudios.com/case-studies',
    ])
  })

  it('allows a supplied link', () => {
    expect(
      findDisallowedLinks('See https://www.devlabstudios.com/r/abc123', ['https://www.devlabstudios.com/r/abc123']),
    ).toEqual([])
  })

  it('ignores trailing punctuation', () => {
    expect(findDisallowedLinks('Visit https://www.devlabstudios.com/.', ['https://www.devlabstudios.com/'])).toEqual([])
  })
})

describe('findUnsupportedObservations', () => {
  const available = [
    'Public pages describe a manual intake step',
    'To begin, please call our office during business hours.',
    'No public booking or scheduling found',
  ]

  it('accepts a paraphrase of a real observation', () => {
    expect(findUnsupportedObservations(['the site asks visitors to call the office'], available)).toEqual([])
  })

  it('flags an observation nothing supports', () => {
    expect(findUnsupportedObservations(['they use Salesforce internally'], available)).toEqual([
      'they use Salesforce internally',
    ])
  })

  it('tolerates an empty claim list', () => {
    expect(findUnsupportedObservations([], available)).toEqual([])
    expect(findUnsupportedObservations(undefined, available)).toEqual([])
  })
})

describe('validateGeneratedMessage', () => {
  it('passes an honest draft', () => {
    const result = validateGeneratedMessage({
      subject: 'Your service request intake',
      body: 'I noticed your contact page asks visitors to call the office. Would an online form help?\n\nStephen',
      referencedObservations: ['contact page asks visitors to call the office'],
    }, {
      availableEvidence: ['To begin, please call our office during business hours.'],
    })

    expect(result.ok).toBe(true)
  })

  it('collects every violation rather than stopping at the first', () => {
    const result = validateGeneratedMessage({
      subject: 'Save 40% today',
      body: 'We charge $2,000 and worked with a similar firm. See https://example.com/x',
    })

    expect(result.ok).toBe(false)
    const codes = result.violations.map((violation) => violation.code)
    expect(codes).toContain('METRIC_CLAIM')
    expect(codes).toContain('PRICE_CLAIM')
    expect(codes).toContain('CLIENT_CLAIM')
    expect(codes).toContain('DISALLOWED_LINK')
  })
})
