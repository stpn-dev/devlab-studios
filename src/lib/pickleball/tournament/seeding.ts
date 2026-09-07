// Pure tournament seeding. No DB, no DO, no clock, no randomness -- see
// task-3-brief.md.
//
// A null OPI means an entrant (pair) with no history. It sorts LAST, never as
// zero: a null OPI is not "worth zero", it is "not comparable yet". Coercing
// it to 0 would rank a real but poor OPI below an unplayed entrant whenever
// that real OPI is negative.
//
// This reaches the same OUTCOME as rankStandings (src/lib/pickleball/
// standings.ts) -- unplayed entities end up last -- but deliberately not by
// the same mechanism. That file's byOpiThenName comparator does `(b.opi ?? 0)
// - (a.opi ?? 0)`, the exact coercion described above; it is safe only
// because isQualified filters `opi !== null` before the comparator ever runs.
// Here the null check lives in the comparator itself, so it holds regardless
// of what the caller filtered. Do not "simplify" this by copying that
// comparator.

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
