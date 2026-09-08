// Pure fixture generation for tournament formats. No DB, no DO, no clock, no
// randomness -- everything comes in as arguments (see task-2-brief.md).
//
// C1 implemented ROUND_ROBIN; C2 adds SINGLE_ELIMINATION. The remaining two
// formats throw naming themselves rather than returning an empty list: an
// empty fixture list would present to an operator as a tournament with no
// matches, which is worse than an error surfacing before the bracket is ever
// shown.

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

export function generateFixtures(format: TournamentFormat, entrants: SeededEntrant[]): GeneratedFixture[] {
  if (format === 'SINGLE_ELIMINATION') return singleEliminationFixtures(entrants)
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
