import { describe, it, expect } from 'vitest'
import { generateFixtures, poolCountFor, minimumEntrants, type SeededEntrant, type GeneratedFixture } from './generateFixtures'
import { resolvePoolQualifiers, type PoolFixture } from './resolvePoolQualifiers'
import type { TournamentStandingsInput } from './rankTournamentStandings'

function entrants(n: number): SeededEntrant[] {
  return Array.from({ length: n }, (_, i) => ({ entrantId: `e${i + 1}`, seed: i + 1 }))
}

function pools(n: number): GeneratedFixture[] {
  return generateFixtures('POOL_TO_BRACKET', entrants(n))
}

const poolFixtures = (fixtures: GeneratedFixture[]) => fixtures.filter((f) => f.bracket === 'POOL')
const mainFixtures = (fixtures: GeneratedFixture[]) => fixtures.filter((f) => f.bracket === 'MAIN')

// The generated set as the database will hold it: keys stand in for ids, and
// sources are rewritten to point at those ids (persistence does the same).
function asPoolFixtures(fixtures: GeneratedFixture[]): PoolFixture[] {
  return fixtures.map((f) => ({
    id: f.key,
    bracket: f.bracket,
    poolLabel: f.poolLabel,
    entrantAId: f.entrantAId,
    entrantBId: f.entrantBId,
    sourceA: f.sourceA && f.sourceA.startsWith('WINNER_OF:') ? `WINNER_OF:${f.sourceA.slice(10)}` : f.sourceA,
    sourceB: f.sourceB && f.sourceB.startsWith('WINNER_OF:') ? `WINNER_OF:${f.sourceB.slice(10)}` : f.sourceB,
    status: f.status as PoolFixture['status'],
    winnerEntrantId: null,
  }))
}

function standingsFor(ids: string[], wins: Record<string, number>): TournamentStandingsInput[] {
  return ids.map((entrantId) => ({
    entrantId,
    seed: Number(entrantId.slice(1)),
    displayName: entrantId,
    wins: wins[entrantId] ?? 0,
    losses: 0,
    pointsFor: (wins[entrantId] ?? 0) * 11,
    pointsAgainst: 0,
    status: 'ACTIVE',
  }))
}

describe('poolCountFor', () => {
  it('never returns fewer than two pools', () => {
    for (const n of [4, 5, 6, 7]) expect(poolCountFor(n)).toBeGreaterThanOrEqual(2)
  })

  it('always returns a power of two, so the bracket that follows has no byes', () => {
    for (let n = 4; n <= 40; n += 1) {
      const count = poolCountFor(n)
      expect(Number.isInteger(Math.log2(count))).toBe(true)
    }
  })

  it('never makes a pool of fewer than two entrants', () => {
    for (let n = 4; n <= 40; n += 1) {
      expect(Math.floor(n / poolCountFor(n))).toBeGreaterThanOrEqual(2)
    }
  })

  it('grows the pool count with the field rather than the pool size', () => {
    expect(poolCountFor(6)).toBe(2)
    expect(poolCountFor(12)).toBe(4)
    expect(poolCountFor(24)).toBe(8)
  })
})

describe('generateFixtures — POOL_TO_BRACKET', () => {
  it('produces no fixtures below the format minimum rather than a degenerate draw', () => {
    expect(minimumEntrants('POOL_TO_BRACKET')).toBe(4)
    expect(pools(3)).toEqual([])
    expect(pools(2)).toEqual([])
  })

  it('assigns every entrant to exactly one pool', () => {
    for (const n of [4, 6, 8, 9, 12, 15]) {
      const appearances = new Map<string, Set<string>>()
      for (const fixture of poolFixtures(pools(n))) {
        for (const id of [fixture.entrantAId, fixture.entrantBId]) {
          if (!id) continue
          const set = appearances.get(id) || new Set<string>()
          set.add(fixture.poolLabel as string)
          appearances.set(id, set)
        }
      }
      expect(appearances.size).toBe(n)
      for (const [, labels] of appearances) expect(labels.size).toBe(1)
    }
  })

  it('snakes the seeds so pools are of even strength, not stacked', () => {
    // 8 entrants, 2 pools: 1,4,5,8 vs 2,3,6,7. Straight dealing would give
    // pool A 1,3,5,7 -- a materially stronger group.
    const byPool = new Map<string, Set<string>>()
    for (const fixture of poolFixtures(pools(8))) {
      const set = byPool.get(fixture.poolLabel as string) || new Set<string>()
      if (fixture.entrantAId) set.add(fixture.entrantAId)
      if (fixture.entrantBId) set.add(fixture.entrantBId)
      byPool.set(fixture.poolLabel as string, set)
    }
    expect([...(byPool.get('A') as Set<string>)].sort()).toEqual(['e1', 'e4', 'e5', 'e8'])
    expect([...(byPool.get('B') as Set<string>)].sort()).toEqual(['e2', 'e3', 'e6', 'e7'])
  })

  it('plays a full round robin inside each pool and nothing across pools', () => {
    const fixtures = poolFixtures(pools(8))
    // Two pools of four: 6 fixtures each.
    expect(fixtures).toHaveLength(12)
    for (const fixture of fixtures) {
      expect(fixture.status).toBe('READY')
      expect(fixture.entrantAId).toBeTruthy()
      expect(fixture.entrantBId).toBeTruthy()
    }
  })

  it('every pool fixture is immediately playable and every bracket fixture waits', () => {
    const fixtures = pools(12)
    expect(poolFixtures(fixtures).every((f) => f.status === 'READY')).toBe(true)
    expect(mainFixtures(fixtures).every((f) => f.status === 'PENDING')).toBe(true)
  })

  it('the bracket takes two qualifiers per pool and has no byes', () => {
    for (const n of [6, 8, 12, 24]) {
      const main = mainFixtures(pools(n))
      const poolCount = poolCountFor(n)
      // A bracket over 2P entrants has 2P-1 fixtures.
      expect(main).toHaveLength(poolCount * 2 - 1)
    }
  })

  it('pairs pool winners against runners-up from a DIFFERENT pool in round one', () => {
    const firstRound = mainFixtures(pools(12)).filter((f) => f.roundNumber === 1)
    expect(firstRound.length).toBeGreaterThan(0)
    for (const fixture of firstRound) {
      const [, labelA, rankA] = (fixture.sourceA as string).split(':')
      const [, labelB, rankB] = (fixture.sourceB as string).split(':')
      // One winner, one runner-up, and never from the same pool -- so nobody
      // replays a pool opponent in the first bracket round.
      expect([rankA, rankB].sort()).toEqual(['1', '2'])
      expect(labelA).not.toBe(labelB)
    }
  })

  it('every POOL_RANK source names a pool that actually exists', () => {
    for (const n of [6, 8, 12, 24]) {
      const fixtures = pools(n)
      const labels = new Set(poolFixtures(fixtures).map((f) => f.poolLabel))
      for (const fixture of mainFixtures(fixtures)) {
        for (const source of [fixture.sourceA, fixture.sourceB]) {
          if (!source?.startsWith('POOL_RANK:')) continue
          expect(labels.has(source.split(':')[1])).toBe(true)
        }
      }
    }
  })

  it('gives every fixture a unique key across pools and bracket', () => {
    for (const n of [6, 8, 12, 24]) {
      const keys = pools(n).map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('is insensitive to the order entrants are supplied in', () => {
    expect(generateFixtures('POOL_TO_BRACKET', [...entrants(8)].reverse())).toEqual(pools(8))
  })
})

describe('resolvePoolQualifiers', () => {
  const finishPool = (fixtures: PoolFixture[], label: string) =>
    fixtures.map((f) => (f.bracket === 'POOL' && f.poolLabel === label ? { ...f, status: 'FINISHED' as const } : f))

  it('fills nothing while any match in the pool is still outstanding', () => {
    const fixtures = asPoolFixtures(pools(8))
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8'], { e1: 3, e4: 2 })
    expect(resolvePoolQualifiers(fixtures, standings)).toEqual([])
  })

  it('fills a pool\'s bracket slots once every match in it is played', () => {
    const fixtures = finishPool(asPoolFixtures(pools(8)), 'A')
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8'], { e1: 3, e4: 2, e5: 1 })
    const ops = resolvePoolQualifiers(fixtures, standings)

    // Two qualifiers from pool A: the winner and the runner-up.
    const filled = ops.filter((op) => op.kind === 'FILL')
    expect(filled).toHaveLength(2)
    expect(filled.map((op) => (op as { entrantId: string }).entrantId).sort()).toEqual(['e1', 'e4'])
  })

  it('leaves the slots PENDING while the OTHER pool has not finished', () => {
    const fixtures = finishPool(asPoolFixtures(pools(8)), 'A')
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8'], { e1: 3, e4: 2 })
    // Pool B has not played, so each bracket fixture still has one unknown
    // side and must not be offered to an operator.
    expect(resolvePoolQualifiers(fixtures, standings).every((op) => op.kind !== 'FILL' || op.status === 'PENDING')).toBe(true)
  })

  it('marks a bracket fixture READY once BOTH pools have delivered their qualifiers', () => {
    const fixtures = finishPool(finishPool(asPoolFixtures(pools(8)), 'A'), 'B')
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8', 'e2', 'e3', 'e6', 'e7'], { e1: 3, e4: 2, e2: 3, e3: 2 })
    const ops = resolvePoolQualifiers(fixtures, standings)

    expect(ops.filter((op) => op.kind === 'FILL')).toHaveLength(4)
    expect(ops.every((op) => op.kind !== 'FILL' || op.status === 'READY')).toBe(true)
  })

  it('never seats a WITHDRAWN entrant, promoting the next pair instead', () => {
    const fixtures = finishPool(asPoolFixtures(pools(8)), 'A')
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8'], { e1: 3, e4: 2, e5: 1 })
    const withWithdrawal = standings.map((row) => (row.entrantId === 'e4' ? { ...row, status: 'WITHDRAWN' } : row))

    const filled = resolvePoolQualifiers(fixtures, withWithdrawal).filter((op) => op.kind === 'FILL')
    expect(filled.map((op) => (op as { entrantId: string }).entrantId).sort()).toEqual(['e1', 'e5'])
  })

  it('VACATES a qualifying slot a depleted pool cannot fill, rather than stalling the bracket', () => {
    const fixtures = finishPool(asPoolFixtures(pools(8)), 'A')
    // Only one survivor in pool A, but the bracket wants two from it.
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8'], { e1: 3 }).map((row) =>
      row.entrantId === 'e1' ? row : { ...row, status: 'WITHDRAWN' },
    )
    const ops = resolvePoolQualifiers(fixtures, standings)

    expect(ops.filter((op) => op.kind === 'FILL')).toHaveLength(1)
    expect(ops.filter((op) => op.kind === 'VACATE')).toHaveLength(1)
  })

  it('is idempotent: re-running after the slots are filled produces the same fills, not duplicates elsewhere', () => {
    const fixtures = finishPool(asPoolFixtures(pools(8)), 'A')
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8'], { e1: 3, e4: 2 })
    expect(resolvePoolQualifiers(fixtures, standings)).toEqual(resolvePoolQualifiers(fixtures, standings))
  })

  it('ignores WINNER_OF sources entirely — those are resolveAdvancement\'s job', () => {
    const fixtures = finishPool(finishPool(asPoolFixtures(pools(8)), 'A'), 'B')
    const standings = standingsFor(['e1', 'e4', 'e5', 'e8', 'e2', 'e3', 'e6', 'e7'], { e1: 3, e4: 2, e2: 3, e3: 2 })
    const ops = resolvePoolQualifiers(fixtures, standings)

    // Only the first bracket round is fed by pools; the final is fed by
    // WINNER_OF and must be untouched here.
    const finalId = mainFixtures(pools(8)).find((f) => f.roundNumber === 2)!.key
    expect(ops.some((op) => op.fixtureId === finalId)).toBe(false)
  })
})
