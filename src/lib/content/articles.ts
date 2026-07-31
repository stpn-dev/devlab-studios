import { getResourcesContent } from '../../worker/repositories/content.js'
import { resourcesContent } from '../../data/resourcesContent.js'
import { getEnv } from '../env'

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

export type ArticleBodyBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string }

/**
 * Parses the plain-text article body format used by the CMS: blank lines
 * separate blocks, `## ` starts a heading, `- ` starts a bullet list item.
 */
export function parseArticleBody(body: string): ArticleBodyBlock[] {
  const lines = String(body || '').split(/\r?\n/)
  const blocks: ArticleBodyBlock[] = []
  let paragraph: string[] = []
  let bulletList: string[] = []

  function flushParagraph() {
    if (!paragraph.length) return
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }

  function flushBulletList() {
    if (!bulletList.length) return
    blocks.push({ type: 'list', items: [...bulletList] })
    bulletList = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushBulletList()
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      flushBulletList()
      blocks.push({ type: 'heading', text: line.slice(3).trim() })
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      bulletList.push(line.slice(2).trim())
      continue
    }

    flushBulletList()
    paragraph.push(line)
  }

  flushParagraph()
  flushBulletList()

  return blocks
}

export function slugifyLabel(value: string | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function formatArticleDate(value: string | undefined): string {
  if (!value) return ''

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
