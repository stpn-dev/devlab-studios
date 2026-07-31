import { getProfileContent } from '../../worker/repositories/content.js'
import { getStaticProfileContent } from '../../data/profileContent.js'
import { getEnv } from '../env'
import zapierBadge from '../../assets/certificates/Zapier_Certificate.png'
import makeBadge from '../../assets/certificates/Make_Certificate.png'
import n8nBadge from '../../assets/certificates/N8N_Certificate.png'
import highLevelBadge from '../../assets/certificates/HighLevelCertificate.png'

const BADGE_IMAGES: Record<string, { src: string }> = {
  'cert-zapier-no-code-automation': zapierBadge,
  'cert-make-no-code-automation': makeBadge,
  'cert-n8n-ai-automation': n8nBadge,
  'cert-highlevel-crm': highLevelBadge,
}

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

export interface CertificationItem {
  id: string
  name: string
  issuer: string
  issuedDate: string
  credentialUrl: string
  badgeImageUrl: string
  sortOrder: number
}

export interface ProfileContentData {
  about: AboutData
  experiences: ExperienceItem[]
  skills: { technical: string[]; personal: string[] }
  tools: unknown[]
  workflowPatterns: unknown[]
  systemCharacteristics: unknown[]
  certifications?: CertificationItem[]
}

function resolveBadgeImages(data: ProfileContentData): ProfileContentData {
  return {
    ...data,
    certifications: (data.certifications || []).map((cert) => ({
      ...cert,
      badgeImageUrl: cert.badgeImageUrl || BADGE_IMAGES[cert.id]?.src || '',
    })),
  }
}

const staticProfileContent = resolveBadgeImages(getStaticProfileContent() as ProfileContentData)

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
    return resolveBadgeImages(data as ProfileContentData)
  } catch {
    return staticProfileContent
  }
}
