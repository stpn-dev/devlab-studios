// Pure ranking of tournament standings -- no DB, no clock, no randomness.
// Mirrors the separation standings.ts already established for the OPI
// leaderboard (see that file's own header comment): SQL supplies the raw
// per-entrant aggregate (tournaments.js's listTournamentStandings), this
// function does the sort. Spec §3.7: "wins, losses, point differential, then
// head-to-head."
//
// Head-to-head is resolved PAIRWISE, from the finished fixture (if any)
// directly between the two entrants being compared inside the sort
// comparator. This is well-defined whenever exactly two entrants are tied on
// both wins and point differential -- the common round-robin case -- and
// deliberately does not attempt to resolve a three-way cycle (A beat B beat C
// beat A), which no fixed rule can break without an additional criterion
// spec §3.7 does not name for C1. A tie left unresolved by head-to-head (no
// fixture was ever played directly between the two, or a cycle) falls back
// to display name, purely for stable render order -- never an invented rank.

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

function compareStandings(fixtures: HeadToHeadFixture[]) {
  return (a: TournamentStandingsInput, b: TournamentStandingsInput): number => {
    if (a.wins !== b.wins) return b.wins - a.wins

    const diffDelta = pointDifferential(b) - pointDifferential(a)
    if (diffDelta !== 0) return diffDelta

    const headToHead = headToHeadResult(a.entrantId, b.entrantId, fixtures)
    if (headToHead !== 0) return -headToHead

    return a.displayName.localeCompare(b.displayName)
  }
}

export function rankTournamentStandings(
  rows: TournamentStandingsInput[],
  fixtures: HeadToHeadFixture[],
): TournamentStandingsEntry[] {
  return [...rows].sort(compareStandings(fixtures)).map((row, index) => ({
    ...row,
    rank: index + 1,
    pointDifferential: pointDifferential(row),
  }))
}
