import { listDigests } from '../../worker/repositories/digests.js'
import { RETENTION_DAYS } from '../../worker/digest/feeds.js'
import { getEnv } from '../env'

export interface DigestItem {
  id: string
  sourceName: string
  sourceUrl: string
  title: string
  summary: string
  publishedAt: string | null
}

export interface Digest {
  id: string
  digestDate: string
  status: string
  itemCount: number
  model: string | null
  generatedAt: string
  items: DigestItem[]
}

/**
 * Published digests for the public page.
 *
 * There is no static fallback, unlike the other content loaders: a digest that
 * does not exist is genuinely absent, and inventing one would mean publishing
 * news items that were never fetched.
 */
export async function loadDigests(limit: number = RETENTION_DAYS): Promise<Digest[]> {
  const env = getEnv()
  if (!env.DB) return []

  try {
    return (await listDigests(env.DB, { limit })) as Digest[]
  } catch {
    return []
  }
}

/** `Friday, 17 September 2026` — spelled out, since these headings are dates first. */
export function formatDigestDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** The bare hostname, which is what a reader actually wants to see next to a link. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
