import { getServicesContent } from '../../worker/repositories/content.js'
import { servicesContent } from '../../data/servicesContent.js'
import { getEnv } from '../env'

export interface SolutionGroup {
  id: string
  eyebrow: string
  title: string
  description: string
  icon: string
  capabilities: string[]
  projectIds: string[]
  sortOrder?: number
  status?: string
}

export interface ProcessStep {
  id?: string
  title: string
  description: string
  icon: string
}

export interface Faq {
  id?: string
  question: string
  answer: string
}

export interface ServicesContentData {
  solutionGroups: SolutionGroup[]
  processSteps: ProcessStep[]
  faqs: Faq[]
}

/**
 * Server-side equivalent of the old useServicesContent() client hook —
 * queries D1 directly during render instead of shipping static content
 * then re-fetching in the browser.
 */
export async function loadServicesContent(): Promise<ServicesContentData> {
  const env = getEnv()
  if (!env.DB) return servicesContent

  try {
    const data = await getServicesContent(env.DB)
    if (!data?.solutionGroups?.length) return servicesContent
    return data
  } catch {
    return servicesContent
  }
}
