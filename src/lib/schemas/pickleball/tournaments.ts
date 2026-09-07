import { z } from 'zod'

export const enterTournamentPairSchema = z.object({
  sessionPairId: z.string().uuid(),
})

export type EnterTournamentPairInput = z.infer<typeof enterTournamentPairSchema>
