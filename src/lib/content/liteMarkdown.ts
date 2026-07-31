export type LiteMarkdownBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string }

/**
 * Parses the plain-text body format used across the CMS (article bodies,
 * richText page blocks): blank lines separate blocks, `## ` starts a
 * heading, `- ` starts a bullet list item.
 */
export function parseLiteMarkdown(body: string): LiteMarkdownBlock[] {
  const lines = String(body || '').split(/\r?\n/)
  const blocks: LiteMarkdownBlock[] = []
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
