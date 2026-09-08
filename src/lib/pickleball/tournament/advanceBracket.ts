// Pure bracket advancement. No DB, no DO, no clock, no randomness -- the
// caller reads fixtures, calls this, and turns the returned updates into
// UPDATE statements.
//
// The whole bracket exists as slots from the moment it is locked
// (generateFixtures), so advancing is never "create the next match": it is
// only ever "fill one side of a fixture that already exists, and mark it
// READY once both sides are known". That is what keeps this function total --
// there is no bracket shape it has to invent.

export interface BracketFixture {
  id: string
  entrantAId: string | null
  entrantBId: string | null
  sourceA: string | null
  sourceB: string | null
  status: 'PENDING' | 'READY' | 'IN_PROGRESS' | 'FINISHED' | 'BYE'
}

export interface BracketSlotUpdate {
  fixtureId: string
  // Which side of the downstream fixture this fills.
  side: 'A' | 'B'
  entrantId: string | null
  // The status the fixture should end up in once this update is applied.
  status: 'PENDING' | 'READY'
}

export interface UnadvanceBlocked {
  ok: false
  // The downstream fixture that has already been played, and so stands in the
  // way of undoing this result.
  blockingFixtureId: string
}

export interface UnadvanceApplied {
  ok: true
  updates: BracketSlotUpdate[]
}

const WINNER_OF = 'WINNER_OF:'

// The fixture (if any) that takes its entrant from `fixtureId`'s winner, and
// which side of it that is. Sources are exact `WINNER_OF:<fixture id>`
// strings written at insert time (tournaments.js rewrites generateFixtures'
// local keys into real ids), so this is an equality check, never a prefix or
// substring match -- a substring match would let one fixture id that happens
// to contain another as a prefix feed the wrong slot.
function downstreamOf(fixtures: BracketFixture[], fixtureId: string): { fixture: BracketFixture; side: 'A' | 'B' } | null {
  const token = `${WINNER_OF}${fixtureId}`
  for (const fixture of fixtures) {
    if (fixture.sourceA === token) return { fixture, side: 'A' }
    if (fixture.sourceB === token) return { fixture, side: 'B' }
  }
  return null
}

/**
 * The slot update that a finished fixture's winner produces, or `null` when
 * nothing feeds from it (the final, or any round-robin fixture -- round robin
 * writes no sources at all, so this is a no-op there rather than a special
 * case the caller has to know about).
 *
 * Returns at most ONE update: a fixture feeds exactly one downstream slot in
 * single elimination. Returning a list would suggest otherwise.
 */
export function advanceBracket(
  fixtures: BracketFixture[],
  finishedFixtureId: string,
  winnerEntrantId: string,
): BracketSlotUpdate | null {
  const downstream = downstreamOf(fixtures, finishedFixtureId)
  if (!downstream) return null

  const { fixture, side } = downstream
  const otherSideFilled = side === 'A' ? fixture.entrantBId !== null : fixture.entrantAId !== null

  return {
    fixtureId: fixture.id,
    side,
    entrantId: winnerEntrantId,
    // READY only once BOTH sides are known. Filling one side of a fixture
    // whose other side is still waiting on an unplayed match must leave it
    // PENDING, or assignCourt would offer a match with one empty chair.
    status: otherSideFilled ? 'READY' : 'PENDING',
  }
}

/**
 * Undo what `advanceBracket` did, for a result being reopened or corrected.
 *
 * Refuses when the downstream fixture has already been started or played:
 * clearing an entrant out of a match that has a real game attached would
 * either orphan that game or silently invalidate a played result. The spec is
 * explicit that the operator is told which fixture stands in the way instead
 * (§3.6), so the blocking fixture's id comes back rather than a bare failure.
 *
 * `ok: true` with an empty `updates` list is the ordinary answer for a final,
 * or for round robin, where nothing was ever advanced -- distinct from a
 * refusal, and the caller must not conflate them.
 */
export function unadvanceBracket(fixtures: BracketFixture[], finishedFixtureId: string): UnadvanceBlocked | UnadvanceApplied {
  const downstream = downstreamOf(fixtures, finishedFixtureId)
  if (!downstream) return { ok: true, updates: [] }

  const { fixture, side } = downstream
  if (fixture.status === 'IN_PROGRESS' || fixture.status === 'FINISHED') {
    return { ok: false, blockingFixtureId: fixture.id }
  }

  return {
    ok: true,
    updates: [
      {
        fixtureId: fixture.id,
        side,
        entrantId: null,
        // Always PENDING: this side is being emptied, so the fixture cannot
        // be READY regardless of what the other side holds.
        status: 'PENDING',
      },
    ],
  }
}
