import { describe, it, expect } from 'vitest'
import { advanceBracket, unadvanceBracket, type BracketFixture } from './advanceBracket'
import { generateFixtures, type SeededEntrant } from './generateFixtures'

function entrants(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({ entrantId: `e${i + 1}`, seed: i + 1 }))
}

// generateFixtures emits local keys in `sourceA`/`sourceB`; persistence
// rewrites them into real ids. These tests do that rewrite themselves (using
// the key AS the id) so they exercise the same wiring the database will hold,
// rather than a hand-built bracket that could disagree with the generator.
function bracketFrom(n: number): BracketFixture[] {
  return generateFixtures('SINGLE_ELIMINATION', entrants(n)).map((f) => ({
    id: f.key,
    entrantAId: f.entrantAId,
    entrantBId: f.entrantBId,
    sourceA: f.sourceA,
    sourceB: f.sourceB,
    status: f.status as BracketFixture['status'],
  }))
}

describe('advanceBracket', () => {
  it('fills the downstream slot the finished fixture feeds', () => {
    const fixtures = bracketFrom(4)
    const update = advanceBracket(fixtures, 'MAIN:1:0', 'e1')

    expect(update).not.toBeNull()
    expect(update!.fixtureId).toBe('MAIN:2:0')
    expect(update!.entrantId).toBe('e1')
  })

  it('leaves the downstream fixture PENDING while its other side is still unknown', () => {
    const fixtures = bracketFrom(4)
    // Nothing has been played, so MAIN:2:0's other side is still waiting on
    // MAIN:1:1 -- filling one side must not make it playable.
    const update = advanceBracket(fixtures, 'MAIN:1:0', 'e1')
    expect(update!.status).toBe('PENDING')
  })

  it('marks the downstream fixture READY once the second side arrives', () => {
    const fixtures = bracketFrom(4)
    const first = advanceBracket(fixtures, 'MAIN:1:0', 'e1')!

    // Apply the first update, then advance the other semi-final.
    const afterFirst = fixtures.map((f) =>
      f.id === first.fixtureId ? { ...f, entrantAId: first.entrantId, status: first.status } : f,
    )
    const second = advanceBracket(afterFirst, 'MAIN:1:1', 'e2')!

    expect(second.fixtureId).toBe('MAIN:2:0')
    expect(second.side).toBe('B')
    expect(second.status).toBe('READY')
  })

  it('fills side A and side B independently, never the same side twice', () => {
    const fixtures = bracketFrom(4)
    const fromFirstSemi = advanceBracket(fixtures, 'MAIN:1:0', 'e1')!
    const fromSecondSemi = advanceBracket(fixtures, 'MAIN:1:1', 'e2')!

    expect(fromFirstSemi.side).toBe('A')
    expect(fromSecondSemi.side).toBe('B')
  })

  it('returns null for the final, which feeds nothing', () => {
    const fixtures = bracketFrom(4)
    expect(advanceBracket(fixtures, 'MAIN:2:0', 'e1')).toBeNull()
  })

  it('returns null for a round-robin fixture, which has no sources at all', () => {
    const roundRobin = generateFixtures('ROUND_ROBIN', entrants(4)).map((f) => ({
      id: f.key,
      entrantAId: f.entrantAId,
      entrantBId: f.entrantBId,
      sourceA: f.sourceA,
      sourceB: f.sourceB,
      status: f.status as BracketFixture['status'],
    }))
    expect(advanceBracket(roundRobin, roundRobin[0].id, 'e1')).toBeNull()
  })

  it('matches the source exactly, so one id being a prefix of another cannot feed the wrong slot', () => {
    // 'abc' is a strict prefix of 'abcd'. A substring or startsWith match
    // would route abc's winner into abcd's downstream fixture.
    const fixtures: BracketFixture[] = [
      { id: 'abc', entrantAId: 'e1', entrantBId: 'e2', sourceA: null, sourceB: null, status: 'FINISHED' },
      { id: 'abcd', entrantAId: 'e3', entrantBId: 'e4', sourceA: null, sourceB: null, status: 'FINISHED' },
      { id: 'final', entrantAId: null, entrantBId: null, sourceA: 'WINNER_OF:abcd', sourceB: null, status: 'PENDING' },
    ]
    expect(advanceBracket(fixtures, 'abc', 'e1')).toBeNull()
    expect(advanceBracket(fixtures, 'abcd', 'e3')!.fixtureId).toBe('final')
  })

  it('carries a bye entrant through: a round-2 slot pre-filled by a bye is READY as soon as its other side is played', () => {
    // n=3 -> seed 1 gets the bye and is already sitting in the final.
    const fixtures = bracketFrom(3)
    const final = fixtures.find((f) => f.id === 'MAIN:2:0')!
    expect(final.entrantAId).toBe('e1')

    const update = advanceBracket(fixtures, 'MAIN:1:1', 'e2')!
    expect(update.fixtureId).toBe('MAIN:2:0')
    expect(update.side).toBe('B')
    expect(update.status).toBe('READY')
  })
})

describe('unadvanceBracket', () => {
  it('clears the downstream slot and returns it to PENDING', () => {
    const fixtures = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantAId: 'e1', status: 'PENDING' as const } : f,
    )
    const result = unadvanceBracket(fixtures, 'MAIN:1:0')

    expect(result.ok).toBe(true)
    const updates = (result as { ok: true; updates: unknown[] }).updates as Array<{
      fixtureId: string
      entrantId: string | null
      status: string
      side: string
    }>
    expect(updates).toHaveLength(1)
    expect(updates[0].fixtureId).toBe('MAIN:2:0')
    expect(updates[0].side).toBe('A')
    expect(updates[0].entrantId).toBeNull()
    expect(updates[0].status).toBe('PENDING')
  })

  it('returns the downstream fixture to PENDING even when its OTHER side is still filled', () => {
    // Both semi-finals played, so the final is READY with both sides known.
    // Undoing one of them must not leave the final READY with a hole in it.
    const fixtures = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantAId: 'e1', entrantBId: 'e2', status: 'READY' as const } : f,
    )
    const result = unadvanceBracket(fixtures, 'MAIN:1:0') as { ok: true; updates: Array<{ status: string }> }
    expect(result.updates[0].status).toBe('PENDING')
  })

  it('refuses when the downstream fixture is already IN_PROGRESS, naming it', () => {
    const fixtures = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantAId: 'e1', entrantBId: 'e2', status: 'IN_PROGRESS' as const } : f,
    )
    const result = unadvanceBracket(fixtures, 'MAIN:1:0')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; blockingFixtureId: string }).blockingFixtureId).toBe('MAIN:2:0')
  })

  it('refuses when the downstream fixture is already FINISHED, naming it', () => {
    const fixtures = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantAId: 'e1', entrantBId: 'e2', status: 'FINISHED' as const } : f,
    )
    const result = unadvanceBracket(fixtures, 'MAIN:1:0')

    expect(result.ok).toBe(false)
    expect((result as { ok: false; blockingFixtureId: string }).blockingFixtureId).toBe('MAIN:2:0')
  })

  it('succeeds with no updates for the final, and that is NOT a refusal', () => {
    const fixtures = bracketFrom(4)
    const result = unadvanceBracket(fixtures, 'MAIN:2:0')

    expect(result.ok).toBe(true)
    expect((result as { ok: true; updates: unknown[] }).updates).toHaveLength(0)
  })

  it('is the exact inverse of advanceBracket for the same fixture', () => {
    const fixtures = bracketFrom(4)
    const forward = advanceBracket(fixtures, 'MAIN:1:0', 'e1')!
    const applied = fixtures.map((f) =>
      f.id === forward.fixtureId ? { ...f, entrantAId: forward.entrantId, status: forward.status } : f,
    )
    const back = unadvanceBracket(applied, 'MAIN:1:0') as { ok: true; updates: Array<{ side: string; entrantId: null }> }

    expect(back.updates[0].side).toBe(forward.side)
    expect(back.updates[0].entrantId).toBeNull()
  })
})
