import { getProfileContent } from '../../worker/repositories/content.js'
import { getStaticProfileContent } from '../../data/profileContent.js'
import { getEnv } from '../env'

export interface AboutData {
  name?: string
  role?: string
  location?: string
  email?: string
  careerObjectives?: string
  shortBio?: string
  education?: Array<{ school: string; program: string; years: string }>
  achievementsAndResponsibilities?: Array<{ title: string; details: string }>
  certificatesAndLicenses?: string[]
  [key: string]: unknown
}

export interface ExperienceItem {
  id: string
  title: string
  role: string
  company: string
  dates: string
  bullets: string[]
}

export interface ProfileContentData {
  about: AboutData
  experiences: ExperienceItem[]
  skills: { technical: string[]; personal: string[] }
  tools: unknown[]
  workflowPatterns: unknown[]
  systemCharacteristics: unknown[]
}

const staticProfileContent = getStaticProfileContent() as ProfileContentData

function hasContent(data: Partial<ProfileContentData> | null | undefined): boolean {
  return Boolean(
    data?.about?.name ||
      (Array.isArray(data?.experiences) && data.experiences.length > 0) ||
      (Array.isArray(data?.skills?.technical) && data.skills.technical.length > 0),
  )
}

/** Server-side equivalent of the old useProfileContent() client hook. */
export async function loadProfileContent(): Promise<ProfileContentData> {
  const env = getEnv()
  if (!env.DB) return staticProfileContent

  try {
    const data = await getProfileContent(env.DB)
    if (!hasContent(data)) return staticProfileContent
    return data as ProfileContentData
  } catch {
    return staticProfileContent
  }
}
