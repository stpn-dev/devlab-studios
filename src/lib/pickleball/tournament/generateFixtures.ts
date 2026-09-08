// Pure fixture generation for tournament formats. No DB, no DO, no clock, no
// randomness -- everything comes in as arguments (see task-2-brief.md).
//
// C1 implements ROUND_ROBIN only. The other three formats throw naming
// themselves rather than returning an empty list: an empty fixture list would
// present to an operator as a tournament with no matches, which is worse than
// an error surfacing before the bracket is ever shown.

export type TournamentFormat = 'ROUND_ROBIN' | 'SINGLE_ELIMINATION' | 'POOL_TO_BRACKET' | 'DOUBLE_ELIMINATION'

export interface SeededEntrant {
  entrantId: string
  seed: number
}

export interface GeneratedFixture {
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

export function generateFixtures(format: TournamentFormat, entrants: SeededEntrant[]): GeneratedFixture[] {
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
