/**
 * Request validation for every Lead CRM API route.
 *
 * Validation happens at the boundary, once, with zod — matching how the rest of
 * this codebase validates inquiries (src/lib/schemas/inquiry.ts). The
 * repositories bind their parameters and the services re-check their own
 * preconditions, so this is the outermost of several layers rather than the
 * only one; what it buys is a precise, field-level error the admin UI can
 * attach to the input that was wrong.
 */

import { z } from 'zod'
import { ALL_STAGES } from '../domain/pipeline.js'
import { SUPPRESSION_REASONS } from '../repositories/suppression.js'
import { COMPLIANCE_STATES } from '../repositories/compliance.js'

const trimmed = (max: number) => z.string().trim().max(max)
const requiredText = (max: number) => z.string().trim().min(1).max(max)

/** ISO-3166 alpha-2, uppercased. */
const countryCode = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase())

/**
 * A campaign slug.
 *
 * Constrained to lowercase kebab-case because it appears in URLs and in job
 * dedupe keys — a slug containing a colon would collide with the `type:id`
 * shape those keys use.
 */
const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.')

/**
 * Campaign configuration.
 *
 * The one genuinely open-ended structure in the system: it holds a vertical's
 * vocabulary, its metros and its source queries, and every field is optional so
 * a campaign can be created with only what its sources need. `passthrough` is
 * deliberate — an adapter added later reads its own key without a schema
 * change here — but every named field below is still type-checked.
 */
export const campaignConfigSchema = z
  .object({
    industryLabel: trimmed(120).optional(),
    targetIndustries: z.array(trimmed(120)).max(40).optional(),
    icpKeywords: z.array(trimmed(120)).max(60).optional(),
    disqualifyingKeywords: z.array(trimmed(120)).max(60).optional(),
    serviceTerms: z.array(trimmed(120)).max(60).optional(),
    metros: z.array(trimmed(120)).max(40).optional(),
    overpass: z
      .object({
        endpoint: z.url().optional(),
        areas: z
          .array(
            z.object({
              name: requiredText(120),
              // south, west, north, east
              bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
            }),
          )
          .max(20)
          .optional(),
        tags: z
          .array(z.object({ key: requiredText(60), value: trimmed(120).optional() }))
          .max(20)
          .optional(),
      })
      .optional(),
    brave: z
      .object({
        queries: z.array(requiredText(300)).max(20).optional(),
        country: trimmed(2).optional(),
        count: z.number().int().min(1).max(20).optional(),
      })
      .optional(),
  })
  .passthrough()

export const createCampaignSchema = z.object({
  name: requiredText(160),
  slug,
  description: trimmed(2_000).optional().default(''),
  countryCode,
  config: campaignConfigSchema.optional().default({}),
  maxCandidates: z.number().int().min(0).max(5_000).optional().default(100),
  maxAiReviews: z.number().int().min(0).max(1_000).optional().default(40),
  scheduleCron: trimmed(120).nullish(),
})

export const updateCampaignSchema = z.object({
  name: requiredText(160).optional(),
  description: trimmed(2_000).optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
  countryCode: countryCode.optional(),
  config: campaignConfigSchema.optional(),
  maxCandidates: z.number().int().min(0).max(5_000).optional(),
  maxAiReviews: z.number().int().min(0).max(1_000).optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduleCron: trimmed(120).nullish(),
})

/**
 * A manual stage change from the admin.
 *
 * `reason` is required for the states where "why" is the whole point: a lead on
 * hold or marked lost is a decision someone will want explained in three
 * months, and a do-not-contact without a reason is an audit gap.
 */
export const leadActionSchema = z
  .object({
    action: z.enum(['set_stage', 'hold', 'resume', 'reject', 'archive', 'do_not_contact', 'mark_won', 'mark_lost', 'set_priority']),
    stage: z.enum(ALL_STAGES as [string, ...string[]]).optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    reason: trimmed(500).optional(),
    suppressDomain: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'set_stage' && !value.stage) {
      ctx.addIssue({ code: 'custom', path: ['stage'], message: 'A target stage is required.' })
    }
    if (value.action === 'set_priority' && !value.priority) {
      ctx.addIssue({ code: 'custom', path: ['priority'], message: 'A priority is required.' })
    }
    const needsReason = ['hold', 'reject', 'do_not_contact', 'mark_lost']
    if (needsReason.includes(value.action) && (!value.reason || value.reason.length < 3)) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A short reason is required.' })
    }
  })

export const leadFiltersSchema = z.object({
  campaignId: z.string().trim().max(64).nullish(),
  stage: z.enum(ALL_STAGES as [string, ...string[]]).nullish(),
  stages: z.array(z.enum(ALL_STAGES as [string, ...string[]])).max(30).optional(),
  countryCode: trimmed(2).nullish(),
  industry: trimmed(120).nullish(),
  metro: trimmed(120).nullish(),
  priority: z.enum(['low', 'normal', 'high']).nullish(),
  minScore: z.number().int().min(0).max(100).nullish(),
  maxScore: z.number().int().min(0).max(100).nullish(),
  aiStatus: z.enum(['qualified', 'pending']).nullish(),
  contactability: z.enum(['contactable', 'no_contact']).nullish(),
  complianceState: z.enum(COMPLIANCE_STATES as [string, ...string[]]).nullish(),
  search: trimmed(120).nullish(),
  since: trimmed(40).nullish(),
  discoveredAfter: trimmed(40).nullish(),
  sort: z.enum(['recent', 'score', 'confidence', 'created', 'company']).nullish(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})

export const draftEditSchema = z.object({
  subject: requiredText(300),
  bodyText: requiredText(8_000),
})

/** The regeneration variants. Mirrors the keys in the versioned prompt files. */
export const draftVariantSchema = z.object({
  variant: z
    .enum(['regenerate', 'shorter', 'more_technical', 'suggest_call', 'no_cta', 'explain_solution'])
    .nullish(),
})

export const manualContactSchema = z.object({
  email: z.email().trim().max(254),
  fullName: trimmed(160).nullish(),
  roleTitle: trimmed(160).nullish(),
  // Provenance is required even for a manual entry: an operator who found an
  // address on a page can say which page, and one who cannot should not be
  // adding it.
  sourceUrl: z.url().max(500),
  sourceType: z.enum([
    'company_contact_page', 'company_about_page', 'company_team_page',
    'company_homepage', 'company_other_page', 'structured_data', 'manual_entry',
  ]),
  publishedPublicly: z.boolean(),
})

export const suppressionSchema = z.object({
  scope: z.enum(['email', 'domain']),
  value: requiredText(254),
  reason: z.enum(SUPPRESSION_REASONS as [string, ...string[]]),
  notes: trimmed(1_000).optional().default(''),
  leadId: z.string().trim().max(64).nullish(),
})

export const suppressionRemovalSchema = z.object({
  reason: requiredText(500),
})

export const sourceUpdateSchema = z.object({
  name: requiredText(160).optional(),
  baseUrl: z.url().max(500).nullish(),
  enabled: z.boolean().optional(),
  automationAllowed: z.boolean().optional(),
  crawlAllowed: z.boolean().optional(),
  policyStatus: z.enum(['unreviewed', 'approved', 'restricted', 'prohibited']).optional(),
  policyNotes: trimmed(2_000).optional(),
})

export const complianceDecisionSchema = z.object({
  state: z.enum(COMPLIANCE_STATES as [string, ...string[]]),
  legalBasis: trimmed(200).nullish(),
  legalBasisReference: trimmed(500).nullish(),
  notes: trimmed(2_000).optional().default(''),
})

export const settingsUpdateSchema = z.object({
  key: requiredText(120),
  value: z.unknown(),
  isSecret: z.boolean().optional().default(false),
})

export const featureFlagUpdateSchema = z.object({
  key: z.enum([
    'engine',
    'discovery',
    'crawler',
    'browserRun',
    'ai',
    'tracking',
    'zohoMail',
    'zohoMailSync',
    'campaignSchedules',
  ]),
  enabled: z.boolean(),
})

export const importSchema = z
  .object({
    format: z.enum(['csv', 'domains']),
    content: requiredText(4_000_000),
  })
  .refine((value) => value.content.length > 0, { message: 'Nothing to import.' })

export const runCampaignSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  // A dry run discovers and dedupes without enqueueing research, which is how
  // the candidate quality of a new campaign is inspected before it costs a
  // single crawl.
  dryRun: z.boolean().optional().default(false),
})

/**
 * Parses a request body, returning a structured failure instead of throwing.
 *
 * Routes turn the issues into the `{ error, issues, field }` shape the existing
 * admin API client already understands (src/admin-app/lib/adminApi.js), so a
 * validation failure lands on the input that caused it rather than in a
 * page-level banner.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; message: string; field?: string; issues: Array<{ path: string; message: string }> } {
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }

  const issues = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  return {
    ok: false,
    message: issues[0]?.message || 'The submitted values are not valid.',
    field: issues[0]?.path || undefined,
    issues,
  }
}

/** Reads and coerces list filters from a query string. */
export function parseLeadFilters(url: URL) {
  const number = (key: string) => {
    const raw = url.searchParams.get(key)
    if (raw === null || raw === '') return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const stages = url.searchParams.getAll('stages').filter(Boolean)

  return leadFiltersSchema.safeParse({
    campaignId: url.searchParams.get('campaignId') || null,
    stage: url.searchParams.get('stage') || null,
    stages: stages.length > 0 ? stages : undefined,
    countryCode: url.searchParams.get('countryCode') || null,
    industry: url.searchParams.get('industry') || null,
    metro: url.searchParams.get('metro') || null,
    priority: url.searchParams.get('priority') || null,
    minScore: number('minScore') ?? null,
    maxScore: number('maxScore') ?? null,
    aiStatus: url.searchParams.get('aiStatus') || null,
    contactability: url.searchParams.get('contactability') || null,
    complianceState: url.searchParams.get('complianceState') || null,
    search: url.searchParams.get('search') || null,
    since: url.searchParams.get('since') || null,
    discoveredAfter: url.searchParams.get('discoveredAfter') || null,
    sort: url.searchParams.get('sort') || null,
    limit: number('limit'),
    offset: number('offset'),
  })
}
