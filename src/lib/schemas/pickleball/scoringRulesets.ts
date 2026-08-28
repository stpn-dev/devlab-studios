import { z } from 'zod'

export const createScoringRulesetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  targetScore: z.number().int().min(1).max(99),
  winBy: z.number().int().min(1).max(10).default(2),
  format: z.enum(['SINGLES', 'DOUBLES']),
})

export type CreateScoringRulesetInput = z.infer<typeof createScoringRulesetSchema>

export const updateScoringRulesetSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  targetScore: z.number().int().min(1).max(99).optional(),
  winBy: z.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
})

export type UpdateScoringRulesetInput = z.infer<typeof updateScoringRulesetSchema>
