import { z } from 'zod'

const quotaField = z.number().int().min(1).max(500).nullable().optional()

export const createOrgInviteSchema = z.object({
  invitedEmail: z.string().email(),
  maxAdmins: quotaField,
  maxFacilitators: quotaField,
  maxScorekeepers: quotaField,
})

export type CreateOrgInviteInput = z.infer<typeof createOrgInviteSchema>

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const acceptOrgInviteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).regex(slugPattern, 'Slug must be lowercase letters, numbers, and hyphens only.'),
})

export type AcceptOrgInviteInput = z.infer<typeof acceptOrgInviteSchema>
