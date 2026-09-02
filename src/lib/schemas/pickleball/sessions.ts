import { z } from 'zod'

export const createSessionSchema = z.object({
  venueId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  sessionType: z.enum(['OPEN_PLAY', 'FIXED_PAIRS']),
  scoringRulesetId: z.string().min(1),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
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
