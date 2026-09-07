import { z } from 'zod'

export const formPairSchema = z.object({
  sessionPlayerAId: z.string().uuid(),
  sessionPlayerBId: z.string().uuid(),
})

export type FormPairInput = z.infer<typeof formPairSchema>
