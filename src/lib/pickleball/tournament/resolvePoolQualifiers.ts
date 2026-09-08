// Pure resolution of POOL_RANK sources: who actually qualifies out of each
// pool, and which bracket slot they take. No DB, no clock.
//
// This is a DIFFERENT shape of advancement from resolveAdvancement, which is
// why it lives apart rather than being folded in. A `WINNER_OF:` source is
// settled by one match finishing, so it resolves incrementally, one slot at a
// time. A `POOL_RANK:` source is settled by a whole pool finishing, and until
// the last pool match is played NO slot fed by that pool can be filled --
// second place is not knowable from a partial table. So this runs once per
// pool completion and fills every slot that pool feeds at once.

import { rankTournamentStandings, type TournamentStandingsInput, type HeadToHeadFixture } from './rankTournamentStandings'
import type { BracketOp } from './advanceBracket'

export interface PoolFixture extends HeadToHeadFixture {
  id: string
  bracket: 'POOL' | 'MAIN' | 'LOSERS'
  poolLabel: string | null
  entrantAId: string | null
  entrantBId: string | null
  sourceA: string | null
  sourceB: string | null
  status: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'FINISHED' | 'BYE'
}

const POOL_RANK = 'POOL_RANK:'

// `POOL_RANK:<label>:<rank>` -> { label, rank }, or null for any other source.
function parsePoolRank(source: string | null): { label: string; rank: number } | null {
  if (!source || !source.startsWith(POOL_RANK)) return null
  const [label, rank] = source.slice(POOL_RANK.length).split(':')
  const parsed = Number(rank)
  if (!label || !Number.isInteger(parsed) || parsed < 1) return null
  return { label, rank: parsed }
}

/**
 * Fills every bracket slot fed by a pool that has just finished.
 *
 * Returns an empty list while any pool match is still outstanding -- including
 * for a pool that is finished but whose slots are already filled, so calling
 * this after every finished game is safe and idempotent rather than something
 * the caller has to gate.
 *
 * A pool that ends with fewer surviving entrants than it has qualifying slots
 * (withdrawals) leaves the extra slots VACATED rather than filled with nobody:
 * that is the same "no entrant, no source" marker the elimination format uses,
 * so whoever faces the empty slot wins by walkover instead of the bracket
 * stalling on a slot that can never be filled.
 */
export function resolvePoolQualifiers(
  fixtures: PoolFixture[],
  standings: TournamentStandingsInput[],
): BracketOp[] {
  const ops: BracketOp[] = []
  const standingsByEntrant = new Map(standings.map((row) => [row.entrantId, row]))

  // Which slots each pool feeds, and at what rank.
  const demandByPool = new Map<string, Array<{ fixtureId: string; side: 'A' | 'B'; rank: number }>>()
  for (const fixture of fixtures) {
    if (fixture.bracket === 'POOL') continue
    for (const side of ['A', 'B'] as const) {
      const parsed = parsePoolRank(side === 'A' ? fixture.sourceA : fixture.sourceB)
      if (!parsed) continue
      const bucket = demandByPool.get(parsed.label) || []
      bucket.push({ fixtureId: fixture.id, side, rank: parsed.rank })
      demandByPool.set(parsed.label, bucket)
    }
  }

  for (const [label, demands] of demandByPool) {
    const poolFixtures = fixtures.filter((fixture) => fixture.bracket === 'POOL' && fixture.poolLabel === label)
    if (poolFixtures.length === 0) continue
    // Until every match in the pool is played, second place -- and often
    // first -- is genuinely unknown. Filling early would seat the wrong pair.
    if (!poolFixtures.every((fixture) => fixture.status === 'FINISHED')) continue

    const poolEntrantIds = new Set<string>()
    for (const fixture of poolFixtures) {
      if (fixture.entrantAId) poolEntrantIds.add(fixture.entrantAId)
      if (fixture.entrantBId) poolEntrantIds.add(fixture.entrantBId)
    }

    // Withdrawn entrants keep their results in the standings table (so a
    // survivor's win count still adds up) but must not take a bracket place
    // they cannot play out.
    const contenders = [...poolEntrantIds]
      .map((entrantId) => standingsByEntrant.get(entrantId))
      .filter((row): row is TournamentStandingsInput => Boolean(row) && row!.status !== 'WITHDRAWN')

    const ranked = rankTournamentStandings(contenders, poolFixtures)

    for (const demand of demands) {
      const qualifier = ranked[demand.rank - 1]
      if (qualifier) {
        ops.push({ kind: 'FILL', fixtureId: demand.fixtureId, side: demand.side, entrantId: qualifier.entrantId, status: 'PENDING' })
      } else {
        ops.push({ kind: 'VACATE', fixtureId: demand.fixtureId, side: demand.side })
      }
    }
  }

  // A bracket fixture is only playable once BOTH of its sides are settled, and
  // one call can settle both (two pools finishing on the same match) or just
  // one. Recomputing readiness here, after every fill, keeps that decision in
  // one place instead of splitting it across the two source kinds.
  return withReadyStatuses(fixtures, ops)
}

// Promotes a FILL to READY when the fixture's other side is, or is about to
// be, occupied. Ops are emitted PENDING above because a slot's readiness
// depends on its sibling, which may be filled by a later op in this same list.
function withReadyStatuses(fixtures: PoolFixture[], ops: BracketOp[]): BracketOp[] {
  const fillsByFixture = new Map<string, Set<'A' | 'B'>>()
  for (const op of ops) {
    if (op.kind !== 'FILL') continue
    const sides = fillsByFixture.get(op.fixtureId) || new Set<'A' | 'B'>()
    sides.add(op.side)
    fillsByFixture.set(op.fixtureId, sides)
  }

  return ops.map((op) => {
    if (op.kind !== 'FILL') return op
    const fixture = fixtures.find((candidate) => candidate.id === op.fixtureId)
    if (!fixture) return op

    const otherSide = op.side === 'A' ? 'B' : 'A'
    const otherAlreadySet = (otherSide === 'A' ? fixture.entrantAId : fixture.entrantBId) !== null
    const otherFilledNow = fillsByFixture.get(op.fixtureId)?.has(otherSide) ?? false

    return otherAlreadySet || otherFilledNow ? { ...op, status: 'READY' as const } : op
  })
}
