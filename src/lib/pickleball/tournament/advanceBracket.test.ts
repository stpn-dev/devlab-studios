import { describe, it, expect } from 'vitest'
import { resolveAdvancement, resolveWithdrawal, unadvanceBracket, type BracketFixture, type BracketOp } from './advanceBracket'
import { generateFixtures, type SeededEntrant } from './generateFixtures'

function entrants(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({ entrantId: `e${i + 1}`, seed: i + 1 }))
}

// generateFixtures emits local keys in `sourceA`/`sourceB`; persistence
// rewrites them into real ids. These tests do that rewrite themselves (using
// the key AS the id) so they exercise the same wiring the database will hold,
// rather than a hand-built bracket that could drift from the generator.
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

// Applies ops the way the repository statements do, so a test can assert on
// the resulting bracket rather than on the op list alone.
function apply(fixtures: BracketFixture[], ops: BracketOp[]): BracketFixture[] {
  let state = fixtures.map((f) => ({ ...f }))
  for (const op of ops) {
    state = state.map((f) => {
      if (f.id !== op.fixtureId) return f
      if (op.kind === 'FILL') {
        return { ...f, [op.side === 'A' ? 'entrantAId' : 'entrantBId']: op.entrantId, status: op.status }
      }
      if (op.kind === 'VACATE') {
        return {
          ...f,
          [op.side === 'A' ? 'entrantAId' : 'entrantBId']: null,
          [op.side === 'A' ? 'sourceA' : 'sourceB']: null,
          status: 'PENDING' as const,
        }
      }
      return { ...f, status: 'FINISHED' as const }
    })
  }
  return state
}

const fillsFor = (ops: BracketOp[], fixtureId: string) => ops.filter((op) => op.kind === 'FILL' && op.fixtureId === fixtureId)

describe('resolveAdvancement', () => {
  it('fills the downstream slot the finished fixture feeds', () => {
    const ops = resolveAdvancement(bracketFrom(4), 'MAIN:1:0', 'e1')
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'FILL', fixtureId: 'MAIN:2:0', entrantId: 'e1' })
  })

  it('leaves the downstream fixture PENDING while its other side is still unknown', () => {
    const ops = resolveAdvancement(bracketFrom(4), 'MAIN:1:0', 'e1')
    expect(ops[0]).toMatchObject({ status: 'PENDING' })
  })

  it('marks the downstream fixture READY once the second side arrives', () => {
    const bracket = bracketFrom(4)
    const afterFirst = apply(bracket, resolveAdvancement(bracket, 'MAIN:1:0', 'e1'))
    const ops = resolveAdvancement(afterFirst, 'MAIN:1:1', 'e2')

    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'FILL', fixtureId: 'MAIN:2:0', side: 'B', status: 'READY' })
  })

  it('fills side A and side B independently, never the same side twice', () => {
    const bracket = bracketFrom(4)
    expect(resolveAdvancement(bracket, 'MAIN:1:0', 'e1')[0]).toMatchObject({ side: 'A' })
    expect(resolveAdvancement(bracket, 'MAIN:1:1', 'e2')[0]).toMatchObject({ side: 'B' })
  })

  it('produces nothing for the final, which feeds no later fixture', () => {
    expect(resolveAdvancement(bracketFrom(4), 'MAIN:2:0', 'e1')).toEqual([])
  })

  it('produces nothing for a round-robin fixture, which has no sources at all', () => {
    const roundRobin: BracketFixture[] = generateFixtures('ROUND_ROBIN', entrants(4)).map((f) => ({
      id: f.key,
      entrantAId: f.entrantAId,
      entrantBId: f.entrantBId,
      sourceA: f.sourceA,
      sourceB: f.sourceB,
      status: f.status as BracketFixture['status'],
    }))
    expect(resolveAdvancement(roundRobin, roundRobin[0].id, 'e1')).toEqual([])
  })

  it('matches the source exactly, so one id being a prefix of another cannot feed the wrong slot', () => {
    const fixtures: BracketFixture[] = [
      { id: 'abc', entrantAId: 'e1', entrantBId: 'e2', sourceA: null, sourceB: null, status: 'FINISHED' },
      { id: 'abcd', entrantAId: 'e3', entrantBId: 'e4', sourceA: null, sourceB: null, status: 'FINISHED' },
      { id: 'final', entrantAId: null, entrantBId: null, sourceA: 'WINNER_OF:abcd', sourceB: null, status: 'PENDING' },
    ]
    expect(resolveAdvancement(fixtures, 'abc', 'e1')).toEqual([])
    expect(resolveAdvancement(fixtures, 'abcd', 'e3')[0]).toMatchObject({ fixtureId: 'final' })
  })

  it('carries a bye entrant through: a round-2 slot pre-filled by a bye is READY as soon as its other side is played', () => {
    const ops = resolveAdvancement(bracketFrom(3), 'MAIN:1:1', 'e2')
    expect(ops[0]).toMatchObject({ kind: 'FILL', fixtureId: 'MAIN:2:0', side: 'B', status: 'READY' })
  })

  // The regression that motivated the whole op-list design.
  it('turns arriving at a VACATED slot into a walkover win, not a fixture that can never be played', () => {
    // n=3: e1 has a bye straight into the final. Withdraw e1 BEFORE the
    // semi-final is played, so the final's A side is vacated.
    const bracket = bracketFrom(3)
    const afterWithdrawal = apply(bracket, resolveWithdrawal(bracket, 'e1', new Set(['e2', 'e3'])))

    // Now the semi resolves. Whoever won it should take the final by walkover.
    const ops = resolveAdvancement(afterWithdrawal, 'MAIN:1:1', 'e2')
    expect(ops).toEqual([
      { kind: 'FILL', fixtureId: 'MAIN:2:0', side: 'B', entrantId: 'e2', status: 'PENDING' },
      { kind: 'FINISH', fixtureId: 'MAIN:2:0', winnerEntrantId: 'e2' },
    ])
  })

  it('cascades a walkover through consecutive vacated rounds', () => {
    // n=4. e1 and e2 both reach the far side of the bracket via withdrawal,
    // so the winner of the one real match walks over twice.
    const bracket = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantBId: null, sourceB: null } : f,
    )
    const ops = resolveAdvancement(bracket, 'MAIN:1:0', 'e1')

    expect(ops).toEqual([
      { kind: 'FILL', fixtureId: 'MAIN:2:0', side: 'A', entrantId: 'e1', status: 'PENDING' },
      { kind: 'FINISH', fixtureId: 'MAIN:2:0', winnerEntrantId: 'e1' },
    ])
  })

  it('never emits two fills for the same fixture from one result', () => {
    const ops = resolveAdvancement(bracketFrom(8), 'MAIN:1:0', 'e1')
    for (const op of ops) {
      if (op.kind === 'FILL') expect(fillsFor(ops, op.fixtureId)).toHaveLength(1)
    }
  })
})

describe('resolveWithdrawal', () => {
  it('hands a READY fixture to the opponent as a walkover and advances them', () => {
    const ops = resolveWithdrawal(bracketFrom(4), 'e1', new Set(['e2', 'e3', 'e4']))
    const semi = bracketFrom(4).find((f) => f.entrantAId === 'e1' || f.entrantBId === 'e1')!
    const opponent = semi.entrantAId === 'e1' ? semi.entrantBId : semi.entrantAId

    expect(ops[0]).toEqual({ kind: 'FINISH', fixtureId: semi.id, winnerEntrantId: opponent })
    expect(ops.some((op) => op.kind === 'FILL' && op.entrantId === opponent)).toBe(true)
  })

  it('gives no walkover when the only opponent has themselves already withdrawn', () => {
    const bracket = bracketFrom(4)
    const semi = bracket.find((f) => f.entrantAId === 'e1' || f.entrantBId === 'e1')!
    const opponent = (semi.entrantAId === 'e1' ? semi.entrantBId : semi.entrantAId) as string

    const ops = resolveWithdrawal(bracket, 'e1', new Set(['e2', 'e3', 'e4'].filter((id) => id !== opponent)))
    expect(ops).toEqual([{ kind: 'FINISH', fixtureId: semi.id, winnerEntrantId: null }])
  })

  // The Critical this function was written to fix.
  it('VACATES rather than finishes a PENDING fixture whose other side has not resolved yet', () => {
    // n=3: e1 sits in the final with the semi still unplayed.
    const ops = resolveWithdrawal(bracketFrom(3), 'e1', new Set(['e2', 'e3']))

    expect(ops).toEqual([{ kind: 'VACATE', fixtureId: 'MAIN:2:0', side: 'A' }])
    // Emphatically NOT a FINISH: closing it here is what stranded the real
    // winner of the semi-final with nowhere to be seated.
    expect(ops.some((op) => op.kind === 'FINISH')).toBe(false)
  })

  it('a vacated side is left with neither an entrant nor a source, so it reads as permanently empty', () => {
    const bracket = bracketFrom(3)
    const final = apply(bracket, resolveWithdrawal(bracket, 'e1', new Set(['e2', 'e3']))).find((f) => f.id === 'MAIN:2:0')!

    expect(final.entrantAId).toBeNull()
    expect(final.sourceA).toBeNull()
    expect(final.status).toBe('PENDING')
    // The other side is untouched and still waiting on the semi.
    expect(final.sourceB).toBe('WINNER_OF:MAIN:1:1')
  })

  it('once a walkover has already finished the last fixture, a later withdrawal has nothing left to close', () => {
    const bracket = bracketFrom(3)
    const afterFirst = apply(bracket, resolveWithdrawal(bracket, 'e1', new Set(['e2', 'e3'])))

    // e2 wins the semi. finishGame marks the played fixture FINISHED itself
    // (buildFinishFixtureStatement) before applying the advancement ops, so
    // the test does the same -- otherwise the semi stays READY and e2 still
    // looks like they have an unplayed match.
    const semiFinished = afterFirst.map((f) => (f.id === 'MAIN:1:1' ? { ...f, status: 'FINISHED' as const } : f))
    const afterSemi = apply(semiFinished, resolveAdvancement(semiFinished, 'MAIN:1:1', 'e2'))

    // The vacated final resolved as a walkover to e2, so nothing is open.
    expect(afterSemi.find((f) => f.id === 'MAIN:2:0')!.status).toBe('FINISHED')
    expect(resolveWithdrawal(afterSemi, 'e2', new Set())).toEqual([])
  })

  it('closes a fixture with no winner when BOTH of its sides have been vacated', () => {
    // A final whose two feeder slots were both vacated by withdrawals: nobody
    // can ever arrive on either side, so it can never be played by anyone.
    const bracket = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantAId: 'e1', sourceA: null, entrantBId: null, sourceB: null, status: 'PENDING' as const } : f,
    )
    const ops = resolveWithdrawal(bracket, 'e1', new Set(['e3', 'e4']))

    expect(ops).toContainEqual({ kind: 'VACATE', fixtureId: 'MAIN:2:0', side: 'A' })
    expect(ops).toContainEqual({ kind: 'FINISH', fixtureId: 'MAIN:2:0', winnerEntrantId: null })
  })

  it('ignores fixtures that are already IN_PROGRESS or FINISHED', () => {
    const bracket = bracketFrom(4).map((f) => ({ ...f, status: 'FINISHED' as const }))
    expect(resolveWithdrawal(bracket, 'e1', new Set(['e2', 'e3', 'e4']))).toEqual([])
  })

  it('produces nothing for an entrant with no open fixtures at all', () => {
    expect(resolveWithdrawal(bracketFrom(4), 'nobody', new Set(['e1']))).toEqual([])
  })

  it('round robin always lands in the walkover case, since every fixture is READY with both sides known', () => {
    const roundRobin: BracketFixture[] = generateFixtures('ROUND_ROBIN', entrants(4)).map((f) => ({
      id: f.key,
      entrantAId: f.entrantAId,
      entrantBId: f.entrantBId,
      sourceA: f.sourceA,
      sourceB: f.sourceB,
      status: f.status as BracketFixture['status'],
    }))
    const ops = resolveWithdrawal(roundRobin, 'e1', new Set(['e2', 'e3', 'e4']))

    // Three opponents, three walkovers, and no VACATE anywhere -- round robin
    // has no sources, so nothing to cascade.
    expect(ops.filter((op) => op.kind === 'FINISH')).toHaveLength(3)
    expect(ops.some((op) => op.kind === 'VACATE')).toBe(false)
    expect(ops.some((op) => op.kind === 'FILL')).toBe(false)
  })
})

describe('unadvanceBracket', () => {
  it('clears the downstream slot and returns it to PENDING', () => {
    const fixtures = bracketFrom(4).map((f) =>
      f.id === 'MAIN:2:0' ? { ...f, entrantAId: 'e1', status: 'PENDING' as const } : f,
    )
    const result = unadvanceBracket(fixtures, 'MAIN:1:0')

    expect(result.ok).toBe(true)
    const updates = (result as { ok: true; updates: Array<{ fixtureId: string; side: string; entrantId: string | null; status: string }> }).updates
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ fixtureId: 'MAIN:2:0', side: 'A', entrantId: null, status: 'PENDING' })
  })

  it('returns the downstream fixture to PENDING even when its OTHER side is still filled', () => {
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
    const result = unadvanceBracket(bracketFrom(4), 'MAIN:2:0')
    expect(result.ok).toBe(true)
    expect((result as { ok: true; updates: unknown[] }).updates).toHaveLength(0)
  })

  it('is the exact inverse of resolveAdvancement for the same fixture', () => {
    const bracket = bracketFrom(4)
    const forward = resolveAdvancement(bracket, 'MAIN:1:0', 'e1')
    const applied = apply(bracket, forward)
    const back = unadvanceBracket(applied, 'MAIN:1:0') as { ok: true; updates: Array<{ side: string; entrantId: null }> }

    expect(back.updates[0].side).toBe((forward[0] as { side: string }).side)
    expect(back.updates[0].entrantId).toBeNull()
  })
})
