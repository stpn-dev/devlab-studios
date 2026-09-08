// Pure fixture generation for tournament formats. No DB, no DO, no clock, no
// randomness -- everything comes in as arguments (see task-2-brief.md).
//
// All four spec formats are implemented. An unrecognised one throws naming
// itself rather than returning an empty list: an empty fixture list would
// present to an operator as a tournament with no matches, which is worse than
// an error surfacing before the bracket is ever shown.

export type TournamentFormat = 'ROUND_ROBIN' | 'SINGLE_ELIMINATION' | 'POOL_TO_BRACKET' | 'DOUBLE_ELIMINATION'

export interface SeededEntrant {
  entrantId: string
  seed: number
}

export interface GeneratedFixture {
  // Stable identity for THIS fixture within the generated set, used only to
  // wire `sourceA`/`sourceB` before any database id exists. Persistence
  // (tournaments.js's insertFixturesStatements) mints a real uuid per fixture
  // and rewrites every `WINNER_OF:<key>` into `WINNER_OF:<uuid>`, so nothing
  // downstream of the insert ever sees a key again. Round robin leaves every
  // source null, so its keys are inert there.
  key: string
  bracket: 'POOL' | 'MAIN' | 'LOSERS'
  poolLabel: string | null
  roundNumber: number
  position: number
  entrantAId: string | null
  entrantBId: string | null
  sourceA: string | null
  sourceB: string | null
  status: 'PENDING' | 'READY' | 'BYE'
}

// Standard circle method (Berger tables): fix one entrant, rotate the rest
// one step per round. This is what makes "no entrant appears twice in a
// round" hold BY CONSTRUCTION -- every round is a perfect matching over the
// circle's current arrangement -- rather than something that happens to be
// true for small n. A `null` slot stands in for a bye when the entrant count
// is odd; pairs involving it are dropped by the caller.
function roundRobinRounds(entrantIds: string[]): Array<Array<[string, string]>> {
  if (entrantIds.length < 2) return []

  const slots: Array<string | null> = [...entrantIds]
  if (slots.length % 2 !== 0) slots.push(null)

  const size = slots.length
  const roundCount = size - 1
  const fixed = slots[0]
  let rotating = slots.slice(1)

  const rounds: Array<Array<[string, string]>> = []
  for (let r = 0; r < roundCount; r++) {
    const circle = [fixed, ...rotating]
    const pairs: Array<[string, string]> = []
    for (let i = 0; i < size / 2; i++) {
      const a = circle[i]
      const b = circle[size - 1 - i]
      if (a !== null && b !== null) pairs.push([a, b])
    }
    rounds.push(pairs)
    // Rotate the non-fixed slots by one: last moves to the front. Over
    // `roundCount` rounds this cycles every rotating entrant through every
    // rotating position exactly once, which is what guarantees every pair
    // meets exactly once (and, with a bye slot, that every entrant sits out
    // exactly once).
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, rotating.length - 1)]
  }
  return rounds
}

export function fixtureKey(bracket: string, roundNumber: number, position: number): string {
  return `${bracket}:${roundNumber}:${position}`
}

// The smallest entrant count each format can actually produce a sensible
// draw from. lockBracket refuses below this with a domain error rather than
// letting generateFixtures return something degenerate -- a pool stage needs
// at least two pools of two, and a bracket needs two entrants.
export function minimumEntrants(format: TournamentFormat): number {
  if (format === 'POOL_TO_BRACKET') return 4
  // Double elimination needs somewhere for a first loss to go. With two
  // entrants the losers bracket is empty and the format collapses to a single
  // match, which is not what an operator picking it is asking for.
  if (format === 'DOUBLE_ELIMINATION') return 3
  return 2
}

export function generateFixtures(format: TournamentFormat, entrants: SeededEntrant[]): GeneratedFixture[] {
  if (format === 'SINGLE_ELIMINATION') return singleEliminationFixtures(entrants)
  if (format === 'POOL_TO_BRACKET') return poolToBracketFixtures(entrants)
  if (format === 'DOUBLE_ELIMINATION') return doubleEliminationFixtures(entrants)
  if (format !== 'ROUND_ROBIN') {
    throw new Error(`Tournament format not yet supported: ${format}`)
  }

  // Sorted by seed (ascending) rather than trusting the caller's array
  // order -- `entrants` here is `seedEntrants`'s own output (seeding.ts),
  // whose seed values are the actual competitive ranking, and the circle
  // method's fixed/rotating split (roundRobinRounds below) is sensitive to
  // the order entrant ids arrive in: it determines who sits out which round
  // when the entrant count is odd, and which round each pair meets in.
  // Every pair still meets exactly once regardless of input order (that
  // property is inherent to the circle method, not seed-dependent), but a
  // caller supplying entrants out of seed order previously got a different,
  // silently-unseeded bracket -- generateFixtures read array position, never
  // `entrant.seed`, making the field dead weight on the interface.
  const sortedEntrants = [...entrants].sort((a, b) => a.seed - b.seed)
  const entrantIds = sortedEntrants.map((entrant) => entrant.entrantId)
  const rounds = roundRobinRounds(entrantIds)

  const fixtures: GeneratedFixture[] = []
  rounds.forEach((pairs, roundIndex) => {
    pairs.forEach(([entrantAId, entrantBId], position) => {
      fixtures.push({
        key: fixtureKey('MAIN', roundIndex + 1, position),
        bracket: 'MAIN',
        poolLabel: null,
        roundNumber: roundIndex + 1,
        position,
        entrantAId,
        entrantBId,
        sourceA: null,
        sourceB: null,
        status: 'READY',
      })
    })
  })

  return fixtures
}

// Standard bracket seeding order for a power-of-two bracket, built
// recursively: order(1) = [1], and order(2k) interleaves each x in order(k)
// with its complement 2k+1-x. That is what puts seeds 1 and 2 in opposite
// halves, seeds 1-4 in separate quarters, and so on, so the top seeds can
// only meet in the final -- the property that makes seeding mean anything at
// all. A hand-written pairing table per bracket size would not have it.
//
// Returns SEED NUMBERS (1-based), not entrant ids: a seed beyond the real
// entrant count is a phantom, and whoever draws it gets a bye.
function bracketSeedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const complement = order.length * 2 + 1
    const next: number[] = []
    for (const seed of order) {
      next.push(seed, complement - seed)
    }
    order = next
  }
  return order
}

function nextPowerOfTwo(n: number): number {
  let size = 1
  while (size < n) size *= 2
  return size
}

// A full single-elimination bracket, generated up front as slots with byes
// already resolved -- exactly n-1 fixtures for n entrants, as the spec's
// format table requires.
//
// Byes are deliberately NOT emitted as fixtures. A bye is not a match: nobody
// plays it, it has no game and no score, and an operator seeing one in the
// fixture list would reasonably try to start it. Instead the entrant that
// received the bye is written straight into its round-2 slot, which is the
// state the bracket would be in after "playing" it anyway. That is also what
// makes the count come out at n-1 rather than bracketSize-1.
//
// Padding to the next power of two puts the phantom seeds at the HIGHEST
// numbers, and bracketSeedOrder pairs lowest against highest, so byes land on
// the top seeds by construction -- there is no separate "assign the byes"
// pass that could ever disagree with the pairing.
function singleEliminationFixtures(entrants: SeededEntrant[]): GeneratedFixture[] {
  if (entrants.length < 2) return []

  const sorted = [...entrants].sort((a, b) => a.seed - b.seed)
  // Re-indexed to a dense 1..n rather than trusting `seed` to be exactly
  // that. seedEntrants emits 1..n today, but bracketSeedOrder does position
  // lookups, not arithmetic on the seed value, so a sparse or 0-based seed
  // set would silently produce a bracket full of phantoms instead of failing.
  const entrantIdBySeed = new Map<number, string>()
  sorted.forEach((entrant, index) => entrantIdBySeed.set(index + 1, entrant.entrantId))

  const size = nextPowerOfTwo(sorted.length)
  const order = bracketSeedOrder(size)
  const roundCount = Math.log2(size)

  // What each slot of the NEXT round already knows: either an entrant id (a
  // bye, advanced straight through) or the key of the fixture whose winner
  // fills it.
  const fixtures: GeneratedFixture[] = []
  let slots: Array<{ entrantId: string | null; sourceKey: string | null }> = []

  for (let position = 0; position < size / 2; position++) {
    const entrantAId = entrantIdBySeed.get(order[position * 2]) ?? null
    const entrantBId = entrantIdBySeed.get(order[position * 2 + 1]) ?? null

    // Both sides phantom is impossible: bracketSeedOrder always pairs a low
    // seed with a high one and size < 2n, so at most one side of any
    // first-round pair can be a phantom.
    if (entrantAId === null || entrantBId === null) {
      slots.push({ entrantId: entrantAId ?? entrantBId, sourceKey: null })
      continue
    }

    const key = fixtureKey('MAIN', 1, position)
    fixtures.push({
      key,
      bracket: 'MAIN',
      poolLabel: null,
      roundNumber: 1,
      position,
      entrantAId,
      entrantBId,
      sourceA: null,
      sourceB: null,
      status: 'READY',
    })
    slots.push({ entrantId: null, sourceKey: key })
  }

  // Later rounds: each fixture consumes two slots from the round below and
  // produces one for the round above. A slot already carrying an entrant id
  // fills that side immediately; otherwise the side waits on
  // `WINNER_OF:<key>`. A fixture with both sides already known is READY from
  // the start -- when two byes meet in round 2 that is a genuinely playable
  // match, not something waiting on a result that will never arrive.
  //
  // Positions are the bracket's own slot indices and are NOT renumbered after
  // byes are dropped, so round 1 can have gaps (n=5 leaves only position 1).
  // That keeps a fixture's position meaningful for drawing the bracket, and
  // nextPlayableFixture only ever orders by it, never assumes it is dense.
  for (let round = 2; round <= roundCount; round++) {
    const nextSlots: Array<{ entrantId: string | null; sourceKey: string | null }> = []
    for (let position = 0; position < slots.length / 2; position++) {
      const slotA = slots[position * 2]
      const slotB = slots[position * 2 + 1]
      const key = fixtureKey('MAIN', round, position)

      fixtures.push({
        key,
        bracket: 'MAIN',
        poolLabel: null,
        roundNumber: round,
        position,
        entrantAId: slotA.entrantId,
        entrantBId: slotB.entrantId,
        sourceA: slotA.sourceKey ? `WINNER_OF:${slotA.sourceKey}` : null,
        sourceB: slotB.sourceKey ? `WINNER_OF:${slotB.sourceKey}` : null,
        status: slotA.entrantId && slotB.entrantId ? 'READY' : 'PENDING',
      })
      nextSlots.push({ entrantId: null, sourceKey: key })
    }
    slots = nextSlots
  }

  return fixtures
}

export const POOL_LABELS = 'ABCDEFGH'.split('')

/**
 * How many pools to split `entrantCount` into.
 *
 * Aims for pools of roughly 3-5, which is the range where a pool stage is
 * worth playing at all: a pool of 2 is a single match dressed up as a group,
 * and pools of 6+ take longer than the bracket that follows them. The result
 * is forced to a power of two so that taking the top two from each pool
 * produces a bracket with no byes -- a pool stage that then hands out byes
 * would be paying the cost of seeding twice and getting it right neither time.
 */
export function poolCountFor(entrantCount: number): number {
  const target = Math.floor(entrantCount / 3)
  let pools = 1
  while (pools * 2 <= target) pools *= 2
  // At least 2 (there is no such thing as a one-pool pool stage), and never
  // so many that a pool would have fewer than 2 entrants.
  return Math.max(2, Math.min(pools, Math.floor(entrantCount / 2), POOL_LABELS.length))
}

// Snake draft by seed: 1->A, 2->B, ... then back ...->B, ->A. Straight
// round-robin dealing would stack every top seed into pool A on a second pass;
// snaking is what keeps pool strength even, which is the only reason to seed a
// pool stage at all.
function assignPools(entrantIds: string[], poolCount: number): string[][] {
  const pools: string[][] = Array.from({ length: poolCount }, () => [])
  entrantIds.forEach((entrantId, index) => {
    const row = Math.floor(index / poolCount)
    const withinRow = index % poolCount
    const poolIndex = row % 2 === 0 ? withinRow : poolCount - 1 - withinRow
    pools[poolIndex].push(entrantId)
  })
  return pools
}

/**
 * Round-robin pools feeding a single-elimination bracket.
 *
 * The bracket is generated up front like any other, but its entrants are not
 * known until the pools finish, so each slot carries a
 * `POOL_RANK:<label>:<rank>` source instead of a `WINNER_OF:` one. Resolving
 * those is a different shape of advancement from the rest of the bracket --
 * it happens once, when a pool completes, rather than per match -- which is
 * why it lives in its own resolver (resolvePoolQualifiers) rather than being
 * squeezed into resolveAdvancement.
 *
 * Two qualifiers per pool, ordered winners-first (A1, B1, ... then A2, B2,
 * ...) before being fed through the same bracketSeedOrder the pure elimination
 * format uses. That ordering is what makes every first-round bracket match
 * cross-pool: a pool winner can only meet a runner-up from a different pool,
 * so nobody replays a pool opponent in the first round they qualify for.
 */
function poolToBracketFixtures(entrants: SeededEntrant[]): GeneratedFixture[] {
  if (entrants.length < minimumEntrants('POOL_TO_BRACKET')) return []

  const sorted = [...entrants].sort((a, b) => a.seed - b.seed)
  const poolCount = poolCountFor(sorted.length)
  const pools = assignPools(
    sorted.map((entrant) => entrant.entrantId),
    poolCount,
  )

  const fixtures: GeneratedFixture[] = []

  // Pool play. Each pool numbers its own rounds and positions from the start;
  // the unique index on (session, bracket, pool_label, round, position)
  // (migration 0014) is what keeps two pools' round-1 fixtures from colliding.
  pools.forEach((poolEntrantIds, poolIndex) => {
    const label = POOL_LABELS[poolIndex]
    roundRobinRounds(poolEntrantIds).forEach((pairs, roundIndex) => {
      pairs.forEach(([entrantAId, entrantBId], position) => {
        fixtures.push({
          key: `POOL:${label}:${roundIndex + 1}:${position}`,
          bracket: 'POOL',
          poolLabel: label,
          roundNumber: roundIndex + 1,
          position,
          entrantAId,
          entrantBId,
          sourceA: null,
          sourceB: null,
          status: 'READY',
        })
      })
    })
  })

  // Qualifier slots, in the order that makes them bracket seeds 1..2P.
  const qualifiers: string[] = []
  for (const rank of [1, 2]) {
    for (let poolIndex = 0; poolIndex < poolCount; poolIndex += 1) {
      qualifiers.push(`POOL_RANK:${POOL_LABELS[poolIndex]}:${rank}`)
    }
  }

  const size = qualifiers.length
  const order = bracketSeedOrder(size)
  const roundCount = Math.log2(size)

  let slots: Array<{ sourceKey: string | null; poolSource: string | null }> = []
  for (let position = 0; position < size / 2; position += 1) {
    const key = fixtureKey('MAIN', 1, position)
    fixtures.push({
      key,
      bracket: 'MAIN',
      poolLabel: null,
      roundNumber: 1,
      position,
      entrantAId: null,
      entrantBId: null,
      sourceA: qualifiers[order[position * 2] - 1],
      sourceB: qualifiers[order[position * 2 + 1] - 1],
      status: 'PENDING',
    })
    slots.push({ sourceKey: key, poolSource: null })
  }

  for (let round = 2; round <= roundCount; round += 1) {
    const nextSlots: Array<{ sourceKey: string | null; poolSource: string | null }> = []
    for (let position = 0; position < slots.length / 2; position += 1) {
      const key = fixtureKey('MAIN', round, position)
      fixtures.push({
        key,
        bracket: 'MAIN',
        poolLabel: null,
        roundNumber: round,
        position,
        entrantAId: null,
        entrantBId: null,
        sourceA: `WINNER_OF:${slots[position * 2].sourceKey}`,
        sourceB: `WINNER_OF:${slots[position * 2 + 1].sourceKey}`,
        status: 'PENDING',
      })
      nextSlots.push({ sourceKey: key, poolSource: null })
    }
    slots = nextSlots
  }

  return fixtures
}

// One losers-bracket (or grand-final) match, or the collapse of one.
//
// A slot is a source string, or null meaning "nothing will ever arrive here".
// Nulls are common and expected: a first-round BYE produces no fixture, so
// there is no loser to drop down, and the losers bracket has a hole exactly
// where the bye was. Rather than emitting a match nobody can play, the hole is
// collapsed the same way the winners bracket collapses a bye -- the surviving
// side passes straight through to the next round. Two holes meeting collapse
// to another hole.
//
// Doing this at GENERATION time matters: a match that can never be played,
// left sitting PENDING in the fixture list, would block every round above it
// with no command able to clear it.
function emitOrCollapse(
  fixtures: GeneratedFixture[],
  slotA: string | null,
  slotB: string | null,
  bracket: 'MAIN' | 'LOSERS',
  roundNumber: number,
  position: number,
): string | null {
  if (!slotA && !slotB) return null
  if (!slotA) return slotB
  if (!slotB) return slotA

  const key = `${bracket}:${roundNumber}:${position}`
  fixtures.push({
    key,
    bracket,
    poolLabel: null,
    roundNumber,
    position,
    entrantAId: null,
    entrantBId: null,
    sourceA: slotA,
    sourceB: slotB,
    status: 'PENDING',
  })
  return `WINNER_OF:${key}`
}

/**
 * Winners bracket + losers bracket + grand final.
 *
 * The winners bracket IS `singleEliminationFixtures`, reused unchanged rather
 * than reimplemented: its bye handling and seeding are already covered by
 * their own tests, and a second copy here is exactly where the two would drift
 * apart. The losers bracket is then derived from which winners-bracket matches
 * actually exist -- a bye produced no fixture, so it drops no loser.
 *
 * Losers-bracket shape, for a bracket of size 2^k, is the standard alternating
 * one: a "major" round where the losers dropping down from the winners bracket
 * meet the survivors already in the losers bracket, then a "minor" round where
 * those survivors play each other, repeating until one remains.
 *
 * DELIBERATE SIMPLIFICATION: there is no bracket reset. If the losers-bracket
 * winner beats the winners-bracket winner in the grand final, they take the
 * title on that one match rather than forcing a decider. A reset is a fixture
 * that only exists conditionally, which is incompatible with this codebase's
 * "the whole bracket is generated up front as slots" model -- every other part
 * of the system (nextPlayableFixture, advancement, the operator's fixture
 * list) assumes the fixture set is fixed at lock. Adding it is a real change,
 * not a flag, and is called out in the operator guide rather than left for
 * someone to discover at a tournament.
 */
function doubleEliminationFixtures(entrants: SeededEntrant[]): GeneratedFixture[] {
  if (entrants.length < minimumEntrants('DOUBLE_ELIMINATION')) return []

  const winners = singleEliminationFixtures(entrants)
  const size = nextPowerOfTwo(entrants.length)
  const roundCount = Math.log2(size)

  const fixtures: GeneratedFixture[] = [...winners]

  // Per winners round, the loser each bracket position drops -- or null where
  // that position was a bye and produced no match at all.
  const loserSources: Array<Array<string | null>> = []
  for (let round = 1; round <= roundCount; round += 1) {
    const positions = size / 2 ** round
    loserSources.push(
      Array.from({ length: positions }, (_, position) => {
        const fixture = winners.find((candidate) => candidate.roundNumber === round && candidate.position === position)
        return fixture ? `LOSER_OF:${fixture.key}` : null
      }),
    )
  }

  // Losers round 1: the first-round losers paired off among themselves.
  let carried: Array<string | null> = []
  for (let position = 0; position < loserSources[0].length / 2; position += 1) {
    carried.push(emitOrCollapse(fixtures, loserSources[0][position * 2], loserSources[0][position * 2 + 1], 'LOSERS', 1, position))
  }

  let losersRound = 1
  for (let winnersRound = 2; winnersRound <= roundCount; winnersRound += 1) {
    // Major round: everyone still alive in the losers bracket meets the
    // losers dropping out of this winners round.
    losersRound += 1
    const dropping = loserSources[winnersRound - 1]
    const afterMajor: Array<string | null> = []
    for (let position = 0; position < Math.max(carried.length, dropping.length); position += 1) {
      afterMajor.push(emitOrCollapse(fixtures, carried[position] ?? null, dropping[position] ?? null, 'LOSERS', losersRound, position))
    }
    carried = afterMajor

    // Minor round: the survivors halve among themselves. Skipped once only one
    // remains -- that is the losers-bracket champion, waiting for the final.
    if (carried.length > 1) {
      losersRound += 1
      const afterMinor: Array<string | null> = []
      for (let position = 0; position < carried.length / 2; position += 1) {
        afterMinor.push(emitOrCollapse(fixtures, carried[position * 2], carried[position * 2 + 1], 'LOSERS', losersRound, position))
      }
      carried = afterMinor
    }
  }

  // Grand final: the unbeaten side against whoever survived the losers
  // bracket. Collapses to nothing if the losers bracket is empty (which only
  // happens when there was never more than one match to lose).
  const winnersFinal = winners.find((fixture) => fixture.roundNumber === roundCount)
  const winnersFinalSlot = winnersFinal ? `WINNER_OF:${winnersFinal.key}` : null
  emitOrCollapse(fixtures, winnersFinalSlot, carried[0] ?? null, 'MAIN', roundCount + 1, 0)

  return fixtures
}
