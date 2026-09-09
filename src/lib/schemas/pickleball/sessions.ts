import { z } from 'zod'

// A tournament is a FIXED_PAIRS session carrying this field, not a third
// sessionType (migration 0014's header) -- cross-field validation against
// sessionType happens in the route below, not here, matching the existing
// FIXED_PAIRS/doubles-ruleset check's precedent (it also needs a value this
// schema alone can't see -- the ruleset's format -- so it isn't a superRefine
// either).
//
// Restricted to the formats generateFixtures.ts actually implements, which is
// narrower than the DB CHECK (0014) on purpose. That function intentionally
// THROWS for a format it doesn't implement, so accepting POOL_TO_BRACKET or
// DOUBLE_ELIMINATION here would let an operator create a tournament that can
// never be locked without a 500. All four spec formats are now implemented,
// so this union matches generateFixtures exactly; it stays an explicit list
// rather than mirroring the DB CHECK, so adding a format to the schema is a
// deliberate act and not a side effect of a migration.
export const tournamentFormatSchema = z.enum(['ROUND_ROBIN', 'SINGLE_ELIMINATION', 'POOL_TO_BRACKET', 'DOUBLE_ELIMINATION'])

export const createSessionSchema = z.object({
  venueId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  sessionType: z.enum(['OPEN_PLAY', 'FIXED_PAIRS']),
  scoringRulesetId: z.string().min(1),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  tournamentFormat: tournamentFormatSchema.optional(),
})

export const sessionStatusSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN_FOR_CHECKIN', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
})

// Whether a session publishes anything to its share link at all, and
// whether that includes the leaderboard. Both are sent together so the
// operator's toggle writes one coherent state rather than two settings that
// can disagree -- `publicLeaderboardEnabled: true` while the whole public
// view is off is a state nobody can observe and nobody meant.
export const sessionVisibilitySchema = z.object({
  publicViewEnabled: z.boolean(),
  publicLeaderboardEnabled: z.boolean(),
})

export const updateSessionNameSchema = z.object({
  name: z.string().trim().min(1).max(160),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type SessionStatusInput = z.infer<typeof sessionStatusSchema>
export type UpdateSessionNameInput = z.infer<typeof updateSessionNameSchema>
export type SessionVisibilityInput = z.infer<typeof sessionVisibilitySchema>
