import { describe, it, expect } from 'vitest'
import { nextPlayableFixture, type FixtureRow } from './nextPlayableFixture'

function fixture(overrides: Partial<FixtureRow> & { id: string }): FixtureRow {
  return {
    id: overrides.id,
    roundNumber: overrides.roundNumber ?? 1,
    position: overrides.position ?? 0,
    entrantAId: overrides.entrantAId ?? `${overrides.id}-a`,
    entrantBId: overrides.entrantBId ?? `${overrides.id}-b`,
    status: overrides.status ?? 'READY',
  }
}

describe('nextPlayableFixture', () => {
  it('returns the lowest roundNumber, then lowest position, among READY fixtures', () => {
    const fixtures = [
      fixture({ id: 'f1', roundNumber: 2, position: 0 }),
      fixture({ id: 'f2', roundNumber: 1, position: 1 }),
      fixture({ id: 'f3', roundNumber: 1, position: 0 }),
    ]
    const result = nextPlayableFixture(fixtures, [])
    expect(result?.id).toBe('f3')
  })

  it('skips a fixture when entrant A is already in play', () => {
    const fixtures = [
      fixture({ id: 'f1', roundNumber: 1, position: 0, entrantAId: 'busy', entrantBId: 'p2' }),
      fixture({ id: 'f2', roundNumber: 1, position: 1, entrantAId: 'p3', entrantBId: 'p4' }),
    ]
    const result = nextPlayableFixture(fixtures, ['busy'])
    expect(result?.id).toBe('f2')
  })

  it('skips a fixture when entrant B (not just A) is already in play', () => {
    // Isolates the B-side check: f1's entrant A is clean, only B is busy. A
    // filter that only checked entrantAId would wrongly let this through.
    const fixtures = [
      fixture({ id: 'f1', roundNumber: 1, position: 0, entrantAId: 'p1', entrantBId: 'busy' }),
      fixture({ id: 'f2', roundNumber: 1, position: 1, entrantAId: 'p3', entrantBId: 'p4' }),
    ]
    const result = nextPlayableFixture(fixtures, ['busy'])
    expect(result?.id).toBe('f2')
  })

  it('skips PENDING, IN_PROGRESS, FINISHED and BYE fixtures', () => {
    const fixtures = [
      fixture({ id: 'pending', roundNumber: 1, position: 0, status: 'PENDING' }),
      fixture({ id: 'inprogress', roundNumber: 1, position: 1, status: 'IN_PROGRESS' }),
      fixture({ id: 'finished', roundNumber: 1, position: 2, status: 'FINISHED' }),
      fixture({ id: 'bye', roundNumber: 1, position: 3, status: 'BYE' }),
      fixture({ id: 'ready', roundNumber: 1, position: 4, status: 'READY' }),
    ]
    const result = nextPlayableFixture(fixtures, [])
    expect(result?.id).toBe('ready')
  })

  it('returns null when nothing is playable, specifically when every READY fixture is blocked by an entrant on a court', () => {
    const fixtures = [
      fixture({ id: 'f1', roundNumber: 1, position: 0, entrantAId: 'busyA', entrantBId: 'p2' }),
      fixture({ id: 'f2', roundNumber: 1, position: 1, entrantAId: 'p3', entrantBId: 'busyB' }),
    ]
    const result = nextPlayableFixture(fixtures, ['busyA', 'busyB'])
    expect(result).toBeNull()
  })

  it('does not mutate its input', () => {
    const fixtures = [
      fixture({ id: 'f1', roundNumber: 2, position: 0 }),
      fixture({ id: 'f2', roundNumber: 1, position: 0 }),
    ]
    const snapshot = JSON.parse(JSON.stringify(fixtures))
    nextPlayableFixture(fixtures, [])
    expect(fixtures).toEqual(snapshot)
  })
})
