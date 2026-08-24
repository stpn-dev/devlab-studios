import { z } from 'zod'

export const inviteMembershipSchema = z.object({
  invitedEmail: z.string().email(),
  role: z.enum(['ADMIN', 'SESSION_FACILITATOR', 'SCOREKEEPER']),
})

export type InviteMembershipInput = z.infer<typeof inviteMembershipSchema>
