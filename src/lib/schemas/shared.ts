import { z } from 'zod'

export const contentStatusSchema = z.enum(['draft', 'published', 'archived'])
export type ContentStatus = z.infer<typeof contentStatusSchema>

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slugs must be lowercase, alphanumeric, hyphen-separated.')

export const seoSchema = z.object({
  metaTitle: z.string().max(70).default(''),
  metaDescription: z.string().max(200).default(''),
  metaKeywords: z.string().max(300).optional().default(''),
  canonicalUrl: z.url().optional().or(z.literal('')).default(''),
  ogTitle: z.string().max(70).optional().default(''),
  ogDescription: z.string().max(200).optional().default(''),
  ogImage: z.string().optional().default(''),
  twitterTitle: z.string().max(70).optional().default(''),
  twitterDescription: z.string().max(200).optional().default(''),
  twitterImage: z.string().optional().default(''),
})
export type Seo = z.infer<typeof seoSchema>

export const sortableSchema = z.object({
  sortOrder: z.number().int().default(999),
})

/** Every collection item shares these — id/status/timestamps are set by the repository layer, not the editor. */
export const baseItemSchema = z.object({
  id: z.string().optional(),
  status: contentStatusSchema.default('draft'),
  sortOrder: z.number().int().default(999),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
