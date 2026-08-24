import { z } from 'zod'

export const createPlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
})

export const updatePlayerSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
})

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>
