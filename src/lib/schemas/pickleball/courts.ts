import { z } from 'zod'

export const createCourtSchema = z.object({
  venueId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export type CreateCourtInput = z.infer<typeof createCourtSchema>
