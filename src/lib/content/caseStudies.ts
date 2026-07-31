import { listCaseStudies, getCaseStudy } from '../../worker/repositories/caseStudies.js'
import { getEnv } from '../env'

export interface CaseStudy {
  id: string
  slug: string
  title: string
  summary: string
  clientName: string
  industry: string
  problem: string
  constraints: string
  architecture: string
  implementation: string
  integrations: string[]
  outcomes: string
  metrics: Array<{ label: string; value: string }>
  screenshots: Array<{ url: string; caption: string }>
  projectIds: string[]
  testimonialId: string | null
  coverImageUrl: string
  isFeatured: boolean
  sortOrder: number
  status: string
}

/** Ships empty today — see docs/content-model.md. Both loaders return an empty/null result gracefully rather than erroring when there's no real data yet. */
export async function loadCaseStudies(): Promise<CaseStudy[]> {
  const env = getEnv()
  if (!env.DB) return []

  try {
    return await listCaseStudies(env.DB)
  } catch {
    return []
  }
}

export async function loadCaseStudy(slug: string): Promise<CaseStudy | null> {
  const env = getEnv()
  if (!env.DB) return null

  try {
    return await getCaseStudy(env.DB, slug)
  } catch {
    return null
  }
}
