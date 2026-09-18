import { describe, expect, it } from 'vitest'
import { priorityForRouting, ROUTING, routeScore, routesToAi, scoreLead, SCORE_CATEGORIES } from './score.js'
import { SCORE_THRESHOLDS, SIGNAL_LABELS, SIGNAL_WEIGHTS } from '../config/defaults.js'
import { STAGES } from '../domain/pipeline.js'
import { stageForRouting } from './score.js'

describe('configuration integrity', () => {
  it('has a human-readable label for every weighted signal', () => {
    // Without this, a newly weighted signal shows the operator a bare code on
    // the one screen that is supposed to explain the score.
    for (const category of SCORE_CATEGORIES) {
      for (const code of Object.keys(SIGNAL_WEIGHTS[category])) {
        expect(SIGNAL_LABELS[code], `missing label for ${code}`).toBeTruthy()
      }
    }
  })

  it('has a weight group for every scoring category', () => {
    for (const category of SCORE_CATEGORIES) {
      expect(SIGNAL_WEIGHTS[category]).toBeTruthy()
    }
  })

  it('keeps the thresholds strictly ordered, so the bands cannot overlap', () => {
    expect(SCORE_THRESHOLDS.hold).toBeLessThan(SCORE_THRESHOLDS.aiReview)
    expect(SCORE_THRESHOLDS.aiReview).toBeLessThan(SCORE_THRESHOLDS.priorityAiReview)
  })

  it('does not weight the same signal in two categories', () => {
    const seen = new Set()
    for (const category of SCORE_CATEGORIES) {
      for (const code of Object.keys(SIGNAL_WEIGHTS[category])) {
        expect(seen.has(code), `${code} is weighted twice`).toBe(false)
        seen.add(code)
      }
    }
  })
})

describe('routeScore', () => {
  it('routes on the configured bands, inclusive at each lower bound', () => {
    expect(routeScore(0)).toBe(ROUTING.NOT_QUALIFIED)
    expect(routeScore(39)).toBe(ROUTING.NOT_QUALIFIED)
    expect(routeScore(40)).toBe(ROUTING.HOLD)
    expect(routeScore(59)).toBe(ROUTING.HOLD)
    expect(routeScore(60)).toBe(ROUTING.AI_REVIEW)
    expect(routeScore(74)).toBe(ROUTING.AI_REVIEW)
    expect(routeScore(75)).toBe(ROUTING.PRIORITY_AI_REVIEW)
    expect(routeScore(100)).toBe(ROUTING.PRIORITY_AI_REVIEW)
  })

  it('follows reconfigured thresholds', () => {
    const strict = { hold: 60, aiReview: 80, priorityAiReview: 95 }
    expect(routeScore(70, strict)).toBe(ROUTING.HOLD)
    expect(routeScore(85, strict)).toBe(ROUTING.AI_REVIEW)
  })
})

describe('scoreLead', () => {
  it('scores nothing for a lead with no signals', () => {
    const result = scoreLead({ detectedSignalKeys: [] })
    expect(result.total).toBe(0)
    expect(result.routing).toBe(ROUTING.NOT_QUALIFIED)
    expect(result.reasons).toEqual([])
  })

  it('adds the configured weight for each signal and explains every point', () => {
    const result = scoreLead({
      detectedSignalKeys: ['TARGET_INDUSTRY', 'ACTIVE_WEBSITE', 'PUBLIC_BUSINESS_EMAIL'],
    })

    expect(result.total).toBe(15 + 5 + 10)
    expect(result.icpFit).toBe(15)
    expect(result.dataQuality).toBe(5)
    expect(result.contactability).toBe(10)

    const explained = result.reasons.reduce((sum, reason) => sum + reason.points, 0)
    expect(explained).toBe(result.total)
  })

  it('produces the worked example from the specification', () => {
    const result = scoreLead({
      detectedSignalKeys: [
        'TARGET_INDUSTRY',
        'ACTIVE_WEBSITE',
        'MANUAL_WORKFLOW_LANGUAGE',
        'MULTIPLE_MANUAL_WORKFLOWS',
        'NO_VISIBLE_SCHEDULING',
        'PUBLIC_BUSINESS_EMAIL',
      ],
    })

    expect(result.total).toBe(50)
    expect(result.reasons.map((reason) => [reason.code, reason.points])).toEqual(
      expect.arrayContaining([
        ['TARGET_INDUSTRY', 15],
        ['ACTIVE_WEBSITE', 5],
        ['MANUAL_WORKFLOW_LANGUAGE', 10],
        ['MULTIPLE_MANUAL_WORKFLOWS', 5],
        ['NO_VISIBLE_SCHEDULING', 5],
        ['PUBLIC_BUSINESS_EMAIL', 10],
      ]),
    )
  })

  it('lets a disqualifying keyword pull a lead below the bar', () => {
    const base = ['TARGET_INDUSTRY', 'ACTIVE_WEBSITE', 'MANUAL_WORKFLOW_LANGUAGE', 'PUBLIC_BUSINESS_EMAIL']

    const clean = scoreLead({ detectedSignalKeys: base })
    const disqualified = scoreLead({ detectedSignalKeys: [...base, 'DISQUALIFYING_KEYWORD'] })

    expect(disqualified.total).toBeLessThan(clean.total)
    expect(disqualified.reasons.some((reason) => reason.points < 0)).toBe(true)
  })

  it('scores an existing booking system as a weaker opportunity, not a rejection', () => {
    const withBooking = scoreLead({ detectedSignalKeys: ['TARGET_INDUSTRY', 'BOOKING_DETECTED'] })
    expect(withBooking.workflowOpportunity).toBeLessThan(0)
    expect(withBooking.total).toBeGreaterThan(0)
  })

  it('never returns a negative total', () => {
    const result = scoreLead({ detectedSignalKeys: ['DISQUALIFYING_KEYWORD', 'BOOKING_DETECTED'] })
    expect(result.total).toBe(0)
    expect(result.routing).toBe(ROUTING.NOT_QUALIFIED)
  })

  it('caps the total at 100', () => {
    const everything = SCORE_CATEGORIES.flatMap((category) =>
      Object.entries(SIGNAL_WEIGHTS[category])
        .filter(([, points]) => points > 0)
        .map(([code]) => code),
    )
    expect(scoreLead({ detectedSignalKeys: everything }).total).toBe(100)
  })

  it('ignores an unweighted signal rather than guessing a value for it', () => {
    const withUnknown = scoreLead({ detectedSignalKeys: ['TARGET_INDUSTRY', 'SOME_BRAND_NEW_SIGNAL'] })
    const without = scoreLead({ detectedSignalKeys: ['TARGET_INDUSTRY'] })
    expect(withUnknown.total).toBe(without.total)
    expect(withUnknown.reasons).toHaveLength(1)
  })

  it('counts a duplicated signal once', () => {
    const result = scoreLead({ detectedSignalKeys: ['TARGET_INDUSTRY', 'TARGET_INDUSTRY'] })
    expect(result.total).toBe(15)
    expect(result.reasons).toHaveLength(1)
  })

  it('leads with the reasons that decided the outcome', () => {
    const result = scoreLead({
      detectedSignalKeys: ['CONTACT_PAGE_REACHABLE', 'TARGET_INDUSTRY', 'PUBLIC_PHONE'],
    })
    expect(result.reasons[0].code).toBe('TARGET_INDUSTRY')
  })

  it('reflects a reconfigured weight without any other change', () => {
    const custom = {
      ...SIGNAL_WEIGHTS,
      icp_fit: { ...SIGNAL_WEIGHTS.icp_fit, TARGET_INDUSTRY: 40 },
    }
    const result = scoreLead({ detectedSignalKeys: ['TARGET_INDUSTRY'], weights: custom })
    expect(result.total).toBe(40)
    expect(result.reasons[0].points).toBe(40)
  })

  it('accepts a Set, which is what the repository returns', () => {
    const result = scoreLead({ detectedSignalKeys: new Set(['TARGET_INDUSTRY']) })
    expect(result.total).toBe(15)
  })
})

describe('routing consequences', () => {
  it('sends only the two AI bands to the model', () => {
    expect(routesToAi(ROUTING.PRIORITY_AI_REVIEW)).toBe(true)
    expect(routesToAi(ROUTING.AI_REVIEW)).toBe(true)
    expect(routesToAi(ROUTING.HOLD)).toBe(false)
    expect(routesToAi(ROUTING.NOT_QUALIFIED)).toBe(false)
  })

  it('maps routing to the pipeline stage', () => {
    expect(stageForRouting(ROUTING.PRIORITY_AI_REVIEW, STAGES)).toBe(STAGES.RULE_QUALIFIED)
    expect(stageForRouting(ROUTING.AI_REVIEW, STAGES)).toBe(STAGES.RULE_QUALIFIED)
    expect(stageForRouting(ROUTING.HOLD, STAGES)).toBe(STAGES.HOLD)
    expect(stageForRouting(ROUTING.NOT_QUALIFIED, STAGES)).toBe(STAGES.NOT_QUALIFIED)
  })

  it('maps routing to priority', () => {
    expect(priorityForRouting(ROUTING.PRIORITY_AI_REVIEW)).toBe('high')
    expect(priorityForRouting(ROUTING.AI_REVIEW)).toBe('normal')
    expect(priorityForRouting(ROUTING.HOLD)).toBe('low')
  })
})
