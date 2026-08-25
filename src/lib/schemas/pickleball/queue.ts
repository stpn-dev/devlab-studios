import { z } from 'zod'

export const joinQueueSchema = z.object({
  sessionPlayerId: z.string().uuid(),
})

export const leaveQueueSchema = z.object({
  sessionPlayerId: z.string().uuid(),
})

export const assignCourtSchema = z.object({
  sessionCourtId: z.string().uuid(),
})

export const replaceAssignedPlayerSchema = z.object({
  sessionCourtId: z.string().uuid(),
  outgoingSessionPlayerId: z.string().uuid(),
  incomingSessionPlayerId: z.string().uuid(),
  outgoingDisposition: z.enum(['UNAVAILABLE', 'REQUEUE']),
})

export const releaseCourtSchema = z.object({
  sessionCourtId: z.string().uuid(),
})

export type AssignCourtInput = z.infer<typeof assignCourtSchema>
export type ReplaceAssignedPlayerInput = z.infer<typeof replaceAssignedPlayerSchema>
