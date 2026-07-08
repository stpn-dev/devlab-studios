import { projectRecords } from '../../src/data/projectRecords.js'

const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || ''

function sqlString(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`
}

function imageUrl(record) {
  if (!publicBaseUrl || !record.imageFilename) return ''
  return `${publicBaseUrl.replace(/\/$/, '')}/projects/${record.imageFilename}`
}

const nowExpression = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

const statements = projectRecords.map((record) => {
  const values = [
    sqlString(record.id),
    sqlString(record.title),
    sqlString(record.description),
    sqlString(JSON.stringify(record.techStack || [])),
    sqlString(record.liveUrl || '#'),
    sqlString(record.sourceUrl || '#'),
    sqlString(imageUrl(record)),
    sqlString(record.imageFilename || ''),
    sqlString(record.type),
    Number(record.sortOrder || 999),
    sqlString(record.status || 'published'),
    nowExpression,
    nowExpression,
  ]

  return `INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  ${values.join(',\n  ')}
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;`
})

process.stdout.write(`${statements.join('\n\n')}\n`)
