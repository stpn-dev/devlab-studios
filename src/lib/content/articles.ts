import { getResourcesContent } from '../../worker/repositories/content.js'
import { resourcesContent } from '../../data/resourcesContent.js'
import { getEnv } from '../env'
import { parseLiteMarkdown, type LiteMarkdownBlock } from './liteMarkdown'

export interface ArticlePost {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  contentType: string
  icon: string
  points: string[]
  body: string
  coverImageUrl: string
  tags: string[]
  authorName: string
  publishedAt: string
  readingTimeMinutes: number | null
  isFeatured: boolean
  sortOrder: number
  status: string
}

export interface ArticlesContentData {
  posts: ArticlePost[]
  playbook: string[]
}

/**
 * Server-side equivalent of the old useResourcesContent() client hook.
 * `articles` is the public-facing name (see docs/content-model.md's
 * Articles/Resources split); the underlying repository function keeps its
 * original name since it also powers the not-yet-renamed admin editor.
 */
export async function loadArticlesContent(): Promise<ArticlesContentData> {
  const env = getEnv()
  if (!env.DB) return resourcesContent

  try {
    const data = await getResourcesContent(env.DB)
    if (!data?.posts?.length) return resourcesContent
    return { posts: data.posts, playbook: data.playbook || [] }
  } catch {
    return resourcesContent
  }
}

export type ArticleBodyBlock = LiteMarkdownBlock

/**
 * Parses the plain-text article body format used by the CMS. Kept as a
 * named re-export for backward compatibility with existing callers — the
 * actual parser is shared with richText page blocks in liteMarkdown.ts.
 */
export const parseArticleBody = parseLiteMarkdown

export function slugifyLabel(value: string | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function formatArticleDate(value: string | undefined): string {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
