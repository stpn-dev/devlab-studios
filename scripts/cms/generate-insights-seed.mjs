// Generates the CMS update that brings D1's `articles` table in line with the
// Insights library in src/data/insights/.
//
// Generated rather than hand-written because the bodies are long prose full of
// apostrophes, and hand-escaping fifteen of those into SQL is a reliable way to
// corrupt one of them silently. The library stays the single source of truth;
// this script only transcribes it.
//
// Usage:
//   node scripts/cms/generate-insights-seed.mjs > scripts/cms/updates/<date>-insights-library.sql
//
// The output is idempotent: every row is an upsert keyed on `id`, and it
// deletes nothing. An article removed from the library is left in the database
// for a human to unpublish deliberately, because a generated DELETE against
// editorial content is exactly the kind of statement that should not exist.

import process from 'node:process'
import { resourcesContent } from '../../src/data/resourcesContent.js'
import { readingTimeMinutes } from '../../src/lib/content/readingTime.ts'

/** SQLite string literal: the only escape is doubling a single quote. */
function sql(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function json(value) {
  return sql(JSON.stringify(value ?? []))
}

const posts = resourcesContent.posts

const featured = posts.filter((post) => post.isFeatured)
if (featured.length !== 1) {
  // The page picks the first featured post and silently falls back to the
  // newest when there is none, so both zero and two would render something
  // plausible and wrong.
  throw new Error(`Expected exactly one featured article, found ${featured.length}`)
}

const slugs = new Set()
for (const post of posts) {
  if (slugs.has(post.slug)) throw new Error(`Duplicate slug: ${post.slug}`)
  slugs.add(post.slug)
}

const lines = [
  '-- GENERATED FILE - do not edit by hand.',
  '-- Source: src/data/insights/*.js',
  '-- Regenerate: node scripts/cms/generate-insights-seed.mjs',
  '--',
  '-- Upserts the Insights library. Idempotent, and deletes nothing.',
  '',
]

for (const post of posts) {
  lines.push(
    `INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  ${sql(post.id)}, ${sql(post.slug)}, ${sql(post.title)}, ${sql(post.summary)},
  ${sql(post.category)}, ${sql(post.contentType)}, ${sql(post.icon)}, ${json(post.points)},
  ${sql(post.body)}, ${sql(post.coverImageUrl || '')}, ${json(post.tags)},
  ${sql(post.authorName)}, ${sql(post.publishedAt)}, ${readingTimeMinutes(post.body) ?? 'NULL'},
  ${post.isFeatured ? 1 : 0}, ${Number(post.sortOrder) || 0}, ${sql(post.status)},
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
`,
  )
}

// Exactly one featured article, enforced in the data rather than hoped for.
lines.push(
  `-- Only the library's featured article stays featured; anything previously
-- flagged in the CMS is cleared, so the page cannot pick a stale one.
UPDATE articles SET is_featured = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE is_featured = 1 AND id <> ${sql(featured[0].id)};
`,
)

// Legacy taxonomy values, for any row that predates the named topics and is
// not in the library above.
lines.push(
  `UPDATE articles SET content_type = 'ai-update', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE content_type = 'news';`,
  `UPDATE articles SET content_type = 'ops-note', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE content_type = 'insight';`,
  '',
)

process.stdout.write(lines.join('\n'))
