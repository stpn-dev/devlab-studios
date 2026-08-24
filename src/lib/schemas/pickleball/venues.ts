import { z } from 'zod'

export const createVenueSchema = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
})

export type CreateVenueInput = z.infer<typeof createVenueSchema>
