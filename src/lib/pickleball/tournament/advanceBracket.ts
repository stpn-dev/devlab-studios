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

// One database-shaped change to a fixture. A withdrawal or a finished match
// can imply a CHAIN of these (see resolveAdvancement), so callers get an
// ordered list rather than a single update.
export type BracketOp =
  // Put an entrant into one side of a fixture.
  | { kind: 'FILL'; fixtureId: string; side: 'A' | 'B'; entrantId: string; status: 'PENDING' | 'READY' }
  // Permanently empty one side: no entrant, and no source either, so nothing
  // will ever arrive there. Clearing the SOURCE as well as the entrant is what
  // makes the dead slot self-describing -- "no entrant and no source" is then
  // an unambiguous marker, where an entrant-only clear would be
  // indistinguishable from a slot still waiting on an unplayed match.
  | { kind: 'VACATE'; fixtureId: string; side: 'A' | 'B' }
  // Close a fixture. `winnerEntrantId` is null only for a fixture neither side
  // could ever play.
  | { kind: 'FINISH'; fixtureId: string; winnerEntrantId: string | null }

const WINNER_OF = 'WINNER_OF:'
const LOSER_OF = 'LOSER_OF:'

function otherSide(side: 'A' | 'B'): 'A' | 'B' {
  return side === 'A' ? 'B' : 'A'
}

function entrantOn(fixture: BracketFixture, side: 'A' | 'B'): string | null {
  return side === 'A' ? fixture.entrantAId : fixture.entrantBId
}

function sourceOn(fixture: BracketFixture, side: 'A' | 'B'): string | null {
  return side === 'A' ? fixture.sourceA : fixture.sourceB
}

// A side nobody will ever occupy: empty, and with no source that could still
// fill it. Only a VACATE produces this state -- at generation every empty side
// either carries a source or belongs to a fixture that is already READY.
function isDeadSide(fixture: BracketFixture, side: 'A' | 'B'): boolean {
  return entrantOn(fixture, side) === null && sourceOn(fixture, side) === null
}

// The fixture (if any) that takes its entrant from `fixtureId`'s winner, and
// which side of it that is. Sources are exact `WINNER_OF:<fixture id>`
// strings written at insert time (tournaments.js rewrites generateFixtures'
// local keys into real ids), so this is an equality check, never a prefix or
// substring match -- a substring match would let one fixture id that happens
// to contain another as a prefix feed the wrong slot.
function downstreamOf(
  fixtures: BracketFixture[],
  fixtureId: string,
  tag: string = WINNER_OF,
): { fixture: BracketFixture; side: 'A' | 'B' } | null {
  const token = `${tag}${fixtureId}`
  for (const fixture of fixtures) {
    if (fixture.sourceA === token) return { fixture, side: 'A' }
    if (fixture.sourceB === token) return { fixture, side: 'B' }
  }
  return null
}

// Walks one entrant forward from `fromFixtureId`: the first hop follows `tag`
// (WINNER_OF for the winner, LOSER_OF for a double-elimination drop-down),
// and every hop after that follows WINNER_OF, because once an entrant is in a
// bracket they progress by winning.
function chainFrom(fixtures: BracketFixture[], tag: string, fromFixtureId: string, entrantId: string): BracketOp[] {
  const ops: BracketOp[] = []
  const seen = new Set<string>([fromFixtureId])

  let currentTag = tag
  let currentFrom = fromFixtureId

  for (;;) {
    const downstream = downstreamOf(fixtures, currentFrom, currentTag)
    if (!downstream) return ops

    const { fixture, side } = downstream
    // A bracket is a DAG, so this can only trip on cyclic data -- but an
    // infinite loop inside a Durable Object command would hang the session,
    // so the guard is cheap insurance rather than dead code.
    if (seen.has(fixture.id)) return ops
    seen.add(fixture.id)

    const opposite = otherSide(side)

    if (entrantOn(fixture, opposite) !== null) {
      ops.push({ kind: 'FILL', fixtureId: fixture.id, side, entrantId, status: 'READY' })
      return ops
    }

    if (!isDeadSide(fixture, opposite)) {
      ops.push({ kind: 'FILL', fixtureId: fixture.id, side, entrantId, status: 'PENDING' })
      return ops
    }

    // Nobody is coming to the other side. Record who arrived (so the bracket
    // still shows who won it and against whom), finish it as a walkover, and
    // carry the same entrant onward -- by winning, from here on.
    ops.push({ kind: 'FILL', fixtureId: fixture.id, side, entrantId, status: 'PENDING' })
    ops.push({ kind: 'FINISH', fixtureId: fixture.id, winnerEntrantId: entrantId })
    currentTag = WINNER_OF
    currentFrom = fixture.id
  }
}

/**
 * Everything that follows from `winnerEntrantId` winning `finishedFixtureId`
 * -- the promotion, plus any walkover it triggers, cascading.
 *
 * The cascade exists because a withdrawal can leave a DEAD side behind
 * (`VACATE`): an entrant with a bye, or one who already won an earlier round,
 * sits in a fixture that is still PENDING because the other side is waiting on
 * an unplayed match. Withdrawing them cannot finish that fixture -- the match
 * that fills the other side has not happened yet -- so their side is vacated
 * instead. When the real qualifier finally arrives, they arrive to an empty
 * chair, and that is a walkover win: the fixture finishes with no game, and
 * they carry straight on to the next round, which may itself be a walkover.
 *
 * Without this, filling a slot whose opponent had withdrawn produced a fixture
 * that was never playable and never finished, and the bracket stopped dead
 * with no command that could restart it.
 *
 * `loserEntrantId` matters only for DOUBLE_ELIMINATION, where a first loss is
 * a drop into the losers bracket rather than elimination. The two chains are
 * independent -- a fixture can feed a winner one way and a loser another --
 * and a format with no LOSER_OF sources anywhere simply produces nothing from
 * the second, so no caller has to branch on format.
 */
export function resolveAdvancement(
  fixtures: BracketFixture[],
  finishedFixtureId: string,
  winnerEntrantId: string,
  loserEntrantId: string | null = null,
): BracketOp[] {
  const ops = chainFrom(fixtures, WINNER_OF, finishedFixtureId, winnerEntrantId)
  if (loserEntrantId) ops.push(...chainFrom(fixtures, LOSER_OF, finishedFixtureId, loserEntrantId))
  return ops
}

/**
 * Everything that follows from `entrantId` withdrawing.
 *
 * Per fixture the entrant still has open:
 *
 * - READY (both sides known) -- the opponent takes a walkover win, if they are
 *   themselves still active, and advances.
 * - PENDING (the other side is still waiting on an unplayed match) -- the
 *   fixture must NOT be finished. Doing so was the bug this function exists to
 *   fix: it closed a fixture whose other side had not resolved, and the real
 *   winner of the feeding match then had nowhere to go, because the slot
 *   update that would have seated them no longer matched a PENDING/READY row.
 *   That entrant vanished from the tournament with no error anywhere. The
 *   withdrawing side is vacated instead, and resolveAdvancement turns it into
 *   a walkover when the qualifier actually arrives.
 * - PENDING with the other side ALREADY dead (both entrants withdrawn) --
 *   nobody can ever play it, so it finishes with no winner and the slot it
 *   feeds is vacated in turn, cascading.
 */
export function resolveWithdrawal(
  fixtures: BracketFixture[],
  entrantId: string,
  activeOpponentIds: ReadonlySet<string>,
): BracketOp[] {
  const ops: BracketOp[] = []

  const open = fixtures.filter(
    (fixture) =>
      (fixture.status === 'READY' || fixture.status === 'PENDING') &&
      (fixture.entrantAId === entrantId || fixture.entrantBId === entrantId),
  )

  for (const fixture of open) {
    const side = fixture.entrantAId === entrantId ? 'A' : 'B'
    const opposite = otherSide(side)
    const opponentId = entrantOn(fixture, opposite)

    if (opponentId !== null) {
      const winnerEntrantId = activeOpponentIds.has(opponentId) ? opponentId : null
      ops.push({ kind: 'FINISH', fixtureId: fixture.id, winnerEntrantId })

      if (winnerEntrantId) {
        ops.push(...resolveAdvancement(fixtures, fixture.id, winnerEntrantId))
        // DOUBLE_ELIMINATION: a walkover produces a winner but NO loser -- the
        // withdrawing pair never played, and could not continue in the losers
        // bracket even if they had. The slot waiting on `LOSER_OF:<this>` must
        // therefore be vacated. Skipping it stranded that slot forever: the
        // winners fixture is now FINISHED, so nothing ever revisits it, and
        // the losers-bracket match could never become READY -- taking every
        // round above it down with it, with no operator command able to
        // recover. Formats with no LOSER_OF sources emit nothing here.
        ops.push(...vacateLoserSlot(fixtures, fixture.id))
      } else {
        // Neither side can play it out, so nobody advances from it at all --
        // both consumers are dead, exactly as for a fixture nobody can win.
        ops.push(...cascadeDeadFixture(fixtures, fixture.id))
      }
      continue
    }

    ops.push({ kind: 'VACATE', fixtureId: fixture.id, side })

    if (isDeadSide(fixture, opposite)) {
      // Both sides withdrawn: this match can never be played by anyone.
      ops.push({ kind: 'FINISH', fixtureId: fixture.id, winnerEntrantId: null })
      ops.push(...cascadeDeadFixture(fixtures, fixture.id))
    }
  }

  return ops
}

/**
 * The ops for "whoever won `finishedFixtureId` cannot take their place in the
 * next round".
 *
 * Two situations reach this. A fixture nobody could win feeds a slot nobody
 * will fill. And a winner who has since WITHDRAWN cannot be promoted: that is
 * reachable because reopening a game leaves its fixture FINISHED, so the
 * entrant has no open fixture and withdrawal is allowed -- then re-finishing
 * the corrected game would otherwise march a withdrawn pair into the next
 * round.
 *
 * Either way the downstream slot is vacated, which turns it into a walkover
 * for whoever arrives on the other side. If that other side is already dead
 * too, the fixture above is unwinnable in turn and the vacating cascades.
 */
export function resolveWinnerUnavailable(fixtures: BracketFixture[], finishedFixtureId: string): BracketOp[] {
  return cascadeDeadFixture(fixtures, finishedFixtureId)
}

// Empties the losers-bracket slot fed by a fixture that produced no loser --
// a walkover. If that leaves the losers-bracket match with BOTH sides dead,
// nobody can ever win it either, so it closes with no winner and the vacating
// carries on upward.
//
// Only the LOSER_OF consumer is touched: the WINNER_OF consumer of a walkover
// has a real winner arriving and must be left alone. That is the difference
// between this and cascadeDeadFixture, which kills both.
function vacateLoserSlot(fixtures: BracketFixture[], fixtureId: string): BracketOp[] {
  const consumer = downstreamOf(fixtures, fixtureId, LOSER_OF)
  if (!consumer) return []

  const ops: BracketOp[] = [{ kind: 'VACATE', fixtureId: consumer.fixture.id, side: consumer.side }]

  const opposite = otherSide(consumer.side)
  if (entrantOn(consumer.fixture, opposite) === null && isDeadSide(consumer.fixture, opposite)) {
    ops.push({ kind: 'FINISH', fixtureId: consumer.fixture.id, winnerEntrantId: null })
    ops.push(...cascadeDeadFixture(fixtures, consumer.fixture.id))
  }

  return ops
}

// A fixture that nobody can win feeds a slot nobody will fill, so that slot is
// dead too -- and if its sibling is already dead, so is the fixture above it.
function cascadeDeadFixture(fixtures: BracketFixture[], deadFixtureId: string): BracketOp[] {
  const ops: BracketOp[] = []
  const seen = new Set<string>([deadFixtureId])

  let fromFixtureId = deadFixtureId
  for (;;) {
    const downstream = downstreamOf(fixtures, fromFixtureId)
    if (!downstream) return ops

    const { fixture, side } = downstream
    if (seen.has(fixture.id)) return ops
    seen.add(fixture.id)

    ops.push({ kind: 'VACATE', fixtureId: fixture.id, side })

    // A fixture nobody can win also drops nobody, so its LOSER_OF consumer is
    // dead as well.
    const loserConsumer = downstreamOf(fixtures, fromFixtureId, LOSER_OF)
    if (loserConsumer) ops.push({ kind: 'VACATE', fixtureId: loserConsumer.fixture.id, side: loserConsumer.side })

    const opposite = otherSide(side)
    // If the other side still has, or can still get, an entrant, that entrant
    // wins this fixture by walkover once they arrive -- resolveAdvancement
    // handles that at the time, so the cascade stops here.
    if (entrantOn(fixture, opposite) !== null || !isDeadSide(fixture, opposite)) return ops

    ops.push({ kind: 'FINISH', fixtureId: fixture.id, winnerEntrantId: null })
    fromFixtureId = fixture.id
  }
}

/**
 * Undo what `resolveAdvancement` did, for a result being reopened or corrected.
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
  // BOTH consumers, not just the winner's. In double elimination a finished
  // match also placed its LOSER into the losers bracket; undoing the result
  // while leaving that drop in place would keep a pair in a bracket they may
  // no longer belong in, and nothing would ever remove them.
  const downstreams = [
    downstreamOf(fixtures, finishedFixtureId, WINNER_OF),
    downstreamOf(fixtures, finishedFixtureId, LOSER_OF),
  ].filter((entry): entry is { fixture: BracketFixture; side: 'A' | 'B' } => entry !== null)

  if (downstreams.length === 0) return { ok: true, updates: [] }

  for (const { fixture } of downstreams) {
    if (fixture.status === 'IN_PROGRESS' || fixture.status === 'FINISHED') {
      return { ok: false, blockingFixtureId: fixture.id }
    }
  }

  return {
    ok: true,
    updates: downstreams.map(({ fixture, side }) => ({
      fixtureId: fixture.id,
      side,
      entrantId: null,
      // Always PENDING: this side is being emptied, so the fixture cannot be
      // READY regardless of what the other side holds.
      status: 'PENDING' as const,
    })),
  }
}
