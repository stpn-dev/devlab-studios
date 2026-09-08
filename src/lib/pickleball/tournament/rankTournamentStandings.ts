// Pure ranking of tournament standings -- no DB, no clock, no randomness.
// Mirrors the separation standings.ts already established for the OPI
// leaderboard (see that file's own header comment): SQL supplies the raw
// per-entrant aggregate (tournaments.js's listTournamentStandings), this
// function does the sort. Spec §3.7: "wins, losses, point differential, then
// head-to-head."
//
// I10: head-to-head must NEVER be a global sort key. `Array.prototype.sort`
// requires its comparator to define a consistent (transitive) order across
// EVERY pair it is asked about; head-to-head is not transitive in general (A
// beat B, B beat C, C beat A is a perfectly ordinary round-robin result), so
// feeding it straight into the comparator invited exactly that cycle to
// corrupt the sort for entrants who were never even tied with each other --
// the spec is silent on what real engines do with an inconsistent
// comparator, and it is not required to be "sort as if the cycle did not
// exist" for every implementation.
//
// The fix (below) is a two-pass sort, same shape iterative sorts elsewhere in
// this codebase use for a similar reason: first sort EVERY row by the pure,
// always-transitive numeric criteria (wins, losses, point differential, then
// name) -- this alone is a valid total order and needs no head-to-head input
// at all. That pass partitions the rows into contiguous groups that are
// truly tied on all three numeric keys. Only WITHIN one such group is
// head-to-head consulted, and only pairwise between two entrants who are
// already known to be tied -- so an inconsistency can, at worst, affect the
// order of that one small group, never spill into unrelated entrants
// elsewhere in the standings. A three-way cycle inside one tie group is
// still not resolved by any fixed rule spec §3.7 names for C1 (this was true
// before this fix too); the difference is that it now stays contained.
//
// A tie left unresolved by head-to-head (no fixture was ever played directly
// between the two, or a cycle) falls back to display name, purely for stable
// render order -- never an invented rank.

export interface TournamentStandingsInput {
  entrantId: string
  seed: number | null
  displayName: string
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
}

export interface TournamentStandingsEntry extends TournamentStandingsInput {
  rank: number
  pointDifferential: number
}

// The subset of a fixture row (tournaments.js's toFixture / listFixtures)
// that head-to-head needs -- callers pass listFixtures' output directly.
export interface HeadToHeadFixture {
  entrantAId: string | null
  entrantBId: string | null
  winnerEntrantId: string | null
  status: string
}

// From entrant `a`'s perspective: 1 if a beat b directly, -1 if b beat a
// directly, 0 if no FINISHED fixture exists directly between them (never
// played yet, or one/both are byes).
function headToHeadResult(a: string, b: string, fixtures: HeadToHeadFixture[]): number {
  const direct = fixtures.find(
    (fixture) =>
      fixture.status === 'FINISHED' &&
      ((fixture.entrantAId === a && fixture.entrantBId === b) || (fixture.entrantAId === b && fixture.entrantBId === a)),
  )
  if (!direct || !direct.winnerEntrantId) return 0
  if (direct.winnerEntrantId === a) return 1
  if (direct.winnerEntrantId === b) return -1
  return 0
}

function pointDifferential(row: TournamentStandingsInput): number {
  return row.pointsFor - row.pointsAgainst
}

// Purely numeric (plus name), always transitive -- safe to run as a GLOBAL
// sort key across the whole standings list. Spec §3.7's first three keys:
// wins (descending), THEN losses (ascending -- I6: this was missing
// entirely, so an entrant on 2-2 could rank above one on 2-0 whenever their
// point differential happened to tie), then point differential
// (descending). Name is the base case so entrants tied on all three sort
// into a stable, deterministic group for the head-to-head pass below to
// operate on.
function compareBaseStanding(a: TournamentStandingsInput, b: TournamentStandingsInput): number {
  if (a.wins !== b.wins) return b.wins - a.wins
  if (a.losses !== b.losses) return a.losses - b.losses

  const diffDelta = pointDifferential(b) - pointDifferential(a)
  if (diffDelta !== 0) return diffDelta

  return a.displayName.localeCompare(b.displayName)
}

// True only for entrants tied on every one of compareBaseStanding's numeric
// keys -- the boundary of one head-to-head tie GROUP, not merely "these two
// happen to compare equal on wins" (which losses/differential could still
// break).
function sameStandingGroup(a: TournamentStandingsInput, b: TournamentStandingsInput): boolean {
  return a.wins === b.wins && a.losses === b.losses && pointDifferential(a) === pointDifferential(b)
}

// Reorders entrants ALREADY known to be tied on wins/losses/differential by
// their direct result against each other, falling back to name. Deliberately
// scoped to run only over one already-grouped tie set (see this file's
// header) -- never over the whole standings list.
function compareWithinTieGroup(fixtures: HeadToHeadFixture[]) {
  return (a: TournamentStandingsInput, b: TournamentStandingsInput): number => {
    const headToHead = headToHeadResult(a.entrantId, b.entrantId, fixtures)
    if (headToHead !== 0) return -headToHead

    return a.displayName.localeCompare(b.displayName)
  }
}

export function rankTournamentStandings(
  rows: TournamentStandingsInput[],
  fixtures: HeadToHeadFixture[],
): TournamentStandingsEntry[] {
  const baseSorted = [...rows].sort(compareBaseStanding)

  const ordered: TournamentStandingsInput[] = []
  let index = 0
  while (index < baseSorted.length) {
    let end = index + 1
    while (end < baseSorted.length && sameStandingGroup(baseSorted[index], baseSorted[end])) end += 1

    const group = baseSorted.slice(index, end)
    // A lone entrant needs no head-to-head pass at all -- and skipping it
    // avoids an unnecessary sort call on a single-element array.
    ordered.push(...(group.length > 1 ? [...group].sort(compareWithinTieGroup(fixtures)) : group))
    index = end
  }

  return ordered.map((row, rankIndex) => ({
    ...row,
    rank: rankIndex + 1,
    pointDifferential: pointDifferential(row),
  }))
}
