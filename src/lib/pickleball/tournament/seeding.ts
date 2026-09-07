// Pure tournament seeding. No DB, no DO, no clock, no randomness -- see
// task-3-brief.md.
//
// A null OPI means an entrant (pair) with no history. It sorts LAST, never
// as zero -- matching how rankStandings (src/lib/pickleball/standings.ts)
// already treats unplayed players: a null OPI is not "worth zero", it is
// "not comparable yet". Coercing it to 0 would wrongly rank a real, poor OPI
// below an unplayed entrant whenever the real OPI is negative.

export interface SeedCandidate {
  entrantId: string
  displayName: string
  opi: number | null
}

// Ties break by displayName only, for stable render order -- never by input
// sequence, matching standings.ts's byOpiThenName convention.
function byOpiThenName(a: SeedCandidate, b: SeedCandidate): number {
  if (a.opi === null && b.opi === null) return a.displayName.localeCompare(b.displayName)
  if (a.opi === null) return 1
  if (b.opi === null) return -1
  if (a.opi !== b.opi) return b.opi - a.opi
  return a.displayName.localeCompare(b.displayName)
}

export function seedEntrants(candidates: SeedCandidate[]): Array<{ entrantId: string; seed: number }> {
  return [...candidates]
    .sort(byOpiThenName)
    .map((candidate, index) => ({ entrantId: candidate.entrantId, seed: index + 1 }))
}
