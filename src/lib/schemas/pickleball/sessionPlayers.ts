import { z } from 'zod'

export const registerPlayerSchema = z.object({
  playerId: z.string().uuid(),
})

export const checkInSchema = z.object({
  playerId: z.string().uuid(),
})

// bulkCheckIn's eligibility SELECT binds 1 + playerIds.length parameters, and
// Cloudflare D1 caps bound parameters per query at 100 — the same limit
// src/worker/repositories/mediaAssets.js documents as
// MAX_BOUND_PARAMS_PER_QUERY. Cap the array at the same 90 so an oversized
// request fails as a clean 400 validation error instead of a raw D1 error 500.
export const bulkCheckInSchema = z.object({
  playerIds: z.array(z.string().uuid()).min(1).max(90),
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
