import { z } from 'zod'

// A tournament is a FIXED_PAIRS session carrying this field, not a third
// sessionType (migration 0014's header) -- cross-field validation against
// sessionType happens in the route below, not here, matching the existing
// FIXED_PAIRS/doubles-ruleset check's precedent (it also needs a value this
// schema alone can't see -- the ruleset's format -- so it isn't a superRefine
// either).
//
// Restricted to 'ROUND_ROBIN' only, though the DB CHECK (0014) already allows
// three other formats reserved for C2-C4: generateFixtures.ts intentionally
// THROWS for any format it doesn't implement yet, and this phase implements
// only ROUND_ROBIN. Accepting the other literals here would let an operator
// create a tournament that can never be locked without a 500 -- narrower than
// the schema strictly needs to be, on purpose.
export const tournamentFormatSchema = z.literal('ROUND_ROBIN')

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

export const updateSessionNameSchema = z.object({
  name: z.string().trim().min(1).max(160),
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type SessionStatusInput = z.infer<typeof sessionStatusSchema>
export type UpdateSessionNameInput = z.infer<typeof updateSessionNameSchema>
