import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACTIONABLE_STAGES,
  ALL_STAGES,
  canTransition,
  COMPLIANCE_TERMINAL_STAGES,
  describeNextAction,
  isComplianceTerminal,
  isTerminal,
  PROGRESSION_STAGES,
  STAGE_LABELS,
  STAGES,
  TERMINAL_STAGES,
} from './pipeline.js'
import { ACTIVITY_LABELS, ALL_ACTIVITY_TYPES, isValidActivityType } from './activity.js'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(resolve(here, '../../../migrations/0012_lead_intelligence_engine.sql'), 'utf8')

describe('schema parity', () => {
  /**
   * The application's stage list and the database's CHECK constraint have to
   * agree. A stage the code believes in and the database rejects is a write
   * that fails in production rather than in CI, and it would fail at the worst
   * moment — mid-pipeline, on a lead that has already cost a crawl and an AI
   * call.
   */
  it('has exactly the same stages as the lead_leads CHECK constraint', () => {
    const checkBlock = migration.slice(
      migration.indexOf("stage TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (stage IN ("),
      migration.indexOf('priority TEXT NOT NULL'),
    )

    // Compared as SETS, not arrays: the DEFAULT value appears once before the
    // CHECK list, so the raw match order contains a duplicate that is not a
    // schema error.
    const inSchema = new Set([...checkBlock.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]))

    expect(inSchema).toEqual(new Set(ALL_STAGES))
  })

  it('has a label for every stage', () => {
    for (const stage of ALL_STAGES) {
      expect(STAGE_LABELS[stage], `missing label for ${stage}`).toBeTruthy()
    }
  })

  it('has a label for every activity type', () => {
    for (const eventType of ALL_ACTIVITY_TYPES) {
      expect(ACTIVITY_LABELS[eventType], `missing label for ${eventType}`).toBeTruthy()
    }
  })

  it('accepts only known activity types', () => {
    expect(isValidActivityType('CRAWL_COMPLETED')).toBe(true)
    expect(isValidActivityType('CRAWL_COMPLETD')).toBe(false)
    expect(isValidActivityType('')).toBe(false)
  })
})

describe('stage sets', () => {
  it('draws the progression path from the full stage set', () => {
    for (const stage of PROGRESSION_STAGES) {
      expect(ALL_STAGES).toContain(stage)
    }
  })

  it('treats every compliance-terminal stage as terminal', () => {
    for (const stage of COMPLIANCE_TERMINAL_STAGES) {
      expect(TERMINAL_STAGES).toContain(stage)
      expect(isTerminal(stage)).toBe(true)
      expect(isComplianceTerminal(stage)).toBe(true)
    }
  })

  it('does not treat an actionable stage as terminal', () => {
    for (const stage of ACTIONABLE_STAGES) {
      expect(isTerminal(stage), stage).toBe(false)
    }
  })
})

describe('canTransition', () => {
  it('allows the ordinary forward moves', () => {
    expect(canTransition(STAGES.DISCOVERED, STAGES.RESEARCHING).allowed).toBe(true)
    expect(canTransition(STAGES.RESEARCHED, STAGES.RULE_QUALIFIED).allowed).toBe(true)
    expect(canTransition(STAGES.READY_TO_CONTACT, STAGES.CONTACTED).allowed).toBe(true)
  })

  it('allows the non-linear jumps the pipeline is supposed to permit', () => {
    // A lead can be rejected from anywhere, and revived from hold.
    expect(canTransition(STAGES.RESEARCHED, STAGES.DO_NOT_CONTACT).allowed).toBe(true)
    expect(canTransition(STAGES.READY_TO_CONTACT, STAGES.HOLD).allowed).toBe(true)
    expect(canTransition(STAGES.HOLD, STAGES.RESEARCHED).allowed).toBe(true)
    expect(canTransition(STAGES.DISCOVERED, STAGES.ARCHIVED).allowed).toBe(true)
  })

  it('refuses to move a lead out of a compliance-terminal stage', () => {
    // The one-way door. Someone asked not to be contacted; no ordinary
    // transition may undo that.
    for (const stage of COMPLIANCE_TERMINAL_STAGES) {
      const result = canTransition(stage, STAGES.READY_TO_CONTACT)
      expect(result.allowed, stage).toBe(false)
      expect(result.reason).toMatch(/suppression/i)
    }
  })

  it('allows the privileged override, which is how an unsuppression works', () => {
    expect(
      canTransition(STAGES.UNSUBSCRIBED, STAGES.RESEARCHED, { allowComplianceOverride: true }).allowed,
    ).toBe(true)
  })

  it('refuses a no-op so the timeline does not fill with non-events', () => {
    expect(canTransition(STAGES.RESEARCHED, STAGES.RESEARCHED).allowed).toBe(false)
  })

  it('refuses an unknown stage', () => {
    expect(canTransition(STAGES.RESEARCHED, 'MADE_UP').allowed).toBe(false)
    expect(canTransition('MADE_UP', STAGES.RESEARCHED).allowed).toBe(false)
  })

  it('allows a first transition from no stage at all', () => {
    expect(canTransition(null, STAGES.DISCOVERED).allowed).toBe(true)
  })
})

describe('describeNextAction', () => {
  it('prompts a human only when a human is what acts next', () => {
    expect(describeNextAction({ stage: STAGES.DISCOVERED })).toBeNull()
    expect(describeNextAction({ stage: STAGES.RESEARCHING })).toBeNull()
    expect(describeNextAction({ stage: STAGES.AWAITING_REPLY })).toBeNull()
  })

  it('asks for review once a draft is waiting', () => {
    expect(describeNextAction({ stage: STAGES.READY_FOR_REVIEW })).toMatch(/review/i)
  })

  it('walks the operator through the manual handoff', () => {
    expect(describeNextAction({ stage: STAGES.READY_TO_CONTACT, hasDraft: false })).toMatch(/generate/i)
    expect(describeNextAction({ stage: STAGES.READY_TO_CONTACT, hasDraft: true, draftExported: false })).toMatch(
      /export/i,
    )
    // The last step is always a person pressing Send. Nothing in this system
    // does it, and the text must never imply otherwise.
    expect(describeNextAction({ stage: STAGES.READY_TO_CONTACT, hasDraft: true, draftExported: true })).toMatch(
      /send it yourself|manually/i,
    )
  })

  it('puts an unanswered reply ahead of everything else', () => {
    const action = describeNextAction({ stage: STAGES.AWAITING_REPLY, hasUnansweredReply: true })
    expect(action).toMatch(/reply/i)
  })

  it('asks for a contact when a qualified lead has none', () => {
    expect(describeNextAction({ stage: STAGES.AI_QUALIFIED, hasContact: false })).toMatch(/contact/i)
    expect(describeNextAction({ stage: STAGES.AI_QUALIFIED, hasContact: true })).toBeNull()
  })

  it('surfaces a compliance review that is blocking progress', () => {
    expect(
      describeNextAction({ stage: STAGES.CONTACT_FOUND, complianceState: 'needs_human_review' }),
    ).toMatch(/compliance/i)
  })
})
