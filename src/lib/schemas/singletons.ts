import { z } from 'zod'
import { pageBlockSchema } from './blocks'
import { seoSchema } from './shared'

export const siteSettingsSchema = z.object({
  brandName: z.string().min(1),
  tagline: z.string().default(''),
  logoOnlyUrl: z.string().default(''),
  logoSideUrl: z.string().default(''),
  defaultOgImage: z.string().default(''),
  availabilityStatus: z.string().default(''),
  legalLinks: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
})
export type SiteSettings = z.infer<typeof siteSettingsSchema>

export const navigationSchema = z.object({
  items: z.array(z.object({
    label: z.string().min(1),
    href: z.string().min(1),
    isExternal: z.boolean().default(false),
  })).default([]),
})
export type Navigation = z.infer<typeof navigationSchema>

export const footerSchema = z.object({
  companyName: z.string().default(''),
  tagline: z.string().default(''),
  email: z.string().default(''),
  location: z.string().default(''),
  copyright: z.string().default(''),
  legalText: z.string().default(''),
  quickLinks: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
  socialLinks: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
})
export type Footer = z.infer<typeof footerSchema>

export const profileSchema = z.object({
  fullName: z.string().min(1),
  professionalTitle: z.string().default(''),
  shortBio: z.string().default(''),
  longBio: z.string().optional().default(''),
  location: z.string().default(''),
  availability: z.string().default(''),
  photoUrl: z.string().default(''),
  resumeUrl: z.string().default(''),
  email: z.string().default(''),
  linkedinUrl: z.string().optional().default(''),
  githubUrl: z.string().optional().default(''),
  technicalSkills: z.array(z.string()).default([]),
  personalSkills: z.array(z.string()).default([]),
})
export type Profile = z.infer<typeof profileSchema>

/**
 * Block-composed singleton pages (Home, About, Process). Contact keeps a
 * fixed form component rather than being block-composed. Backed by the
 * repurposed `pages`/`page_sections` tables (see src/worker/repositories/pages.js).
 */
export const pageSingletonSchema = z.object({
  slug: z.enum(['home', 'about', 'process', 'contact']),
  title: z.string().min(1),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  blocks: z.array(pageBlockSchema).default([]),
  seo: seoSchema.optional(),
})
export type PageSingleton = z.infer<typeof pageSingletonSchema>

/** Privacy/Terms are simple long-form pages, not block-composed. */
export const legalPageSchema = z.object({
  slug: z.enum(['privacy', 'terms']),
  title: z.string().min(1),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  body: z.string().min(1),
  seo: seoSchema.optional(),
})
export type LegalPage = z.infer<typeof legalPageSchema>
