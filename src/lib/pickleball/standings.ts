import { confidenceTier, type ConfidenceTier } from './opi'

// Session standings = the *whole* attending roster, ranked, from the moment a
// session goes live -- distinct from the OPI leaderboard's snapshot table,
// which by construction only ever holds a row for a player who has already
// finished an eligible game (see playerPerformanceSnapshots.js's
// `HAVING COUNT(*) > 0`). That table is the right shape for an all-time
// leaderboard and the wrong shape for a live session board: it renders an
// empty screen for the entire first game of every session.
//
// This function does NOT change what OPI means. Eligibility stays exactly as
// spec §8 defines it (FINISHED games with a valid final score), so `opi` is
// still null until a player's first eligible game lands, and an in-progress
// score never contributes. What changes is only *who appears on the board*:
// a 0-game player is listed as present-and-unranked rather than omitted.
export interface StandingsInput {
  playerId: string
  displayName: string
  eligibleGamesCount: number
  opi: number | null
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  onCourt: boolean
}

export interface StandingsEntry extends StandingsInput {
  rank: number | null
  qualified: boolean
  pointDifferential: number
  confidenceTier: ConfidenceTier
}

// A player with zero eligible games is never ranked, whatever the threshold:
// `minGames = 0` means "rank everyone who has played," not "invent a rank for
// a player with no games," whose `opi` is null and therefore not comparable.
function isQualified(row: StandingsInput, minGames: number): boolean {
  return row.eligibleGamesCount > 0 && row.eligibleGamesCount >= minGames && row.opi !== null
}

// Spec §8: ties broken by display name for render order only, never by games
// played -- a player must not gain or lose a rank for having played more.
function byOpiThenName(a: StandingsInput, b: StandingsInput): number {
  const opiDelta = (b.opi ?? 0) - (a.opi ?? 0)
  if (opiDelta !== 0) return opiDelta
  return a.displayName.localeCompare(b.displayName)
}

// Below the threshold there is no rank to defend, so order by "closest to
// qualifying" -- games played first -- which puts players with no games yet
// at the very bottom of the board where an operator expects them.
function byProgressThenOpiThenName(a: StandingsInput, b: StandingsInput): number {
  const gamesDelta = b.eligibleGamesCount - a.eligibleGamesCount
  if (gamesDelta !== 0) return gamesDelta
  return byOpiThenName(a, b)
}

function toEntry(row: StandingsInput, rank: number | null, qualified: boolean): StandingsEntry {
  return {
    ...row,
    rank,
    qualified,
    pointDifferential: row.pointsFor - row.pointsAgainst,
    confidenceTier: confidenceTier(row.eligibleGamesCount),
  }
}

export function rankStandings(rows: StandingsInput[], minGames: number): StandingsEntry[] {
  const qualified = rows.filter((row) => isQualified(row, minGames))
  const provisional = rows.filter((row) => !isQualified(row, minGames))

  return [
    ...[...qualified].sort(byOpiThenName).map((row, index) => toEntry(row, index + 1, true)),
    ...[...provisional].sort(byProgressThenOpiThenName).map((row) => toEntry(row, null, false)),
  ]
}
