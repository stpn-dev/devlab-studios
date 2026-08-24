import { z } from 'zod'

export const registerPlayerSchema = z.object({
  playerId: z.string().uuid(),
})

export const checkInSchema = z.object({
  playerId: z.string().uuid(),
})

export const bulkCheckInSchema = z.object({
  playerIds: z.array(z.string().uuid()).min(1),
})

export const setAvailabilitySchema = z.object({
  playerId: z.string().uuid(),
  status: z.enum(['AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'RESTING']),
})

export const playerIdBodySchema = z.object({
  playerId: z.string().uuid(),
})

export type RegisterPlayerInput = z.infer<typeof registerPlayerSchema>
export type BulkCheckInInput = z.infer<typeof bulkCheckInSchema>
export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>
