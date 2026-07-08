import { nowIso, parseJsonField } from '../utils/responses'

function toProject(row) {
  if (!row) return null

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    techStack: parseJsonField(row.tech_stack, []),
    liveUrl: row.live_url || '#',
    sourceUrl: row.source_url || '#',
    imageUrl: row.image_url || '',
    imageFilename: row.image_filename || '',
    type: row.type,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toDbProject(input) {
  return {
    id: String(input.id || '').trim(),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    tech_stack: JSON.stringify(Array.isArray(input.techStack) ? input.techStack : []),
    live_url: String(input.liveUrl || '#').trim() || '#',
    source_url: String(input.sourceUrl || '#').trim() || '#',
    image_url: String(input.imageUrl || '').trim(),
    image_filename: String(input.imageFilename || '').trim(),
    type: String(input.type || '').trim(),
    sort_order: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 999,
    status: input.status === 'draft' ? 'draft' : 'published',
  }
}

export async function listProjects(db, { includeDrafts = false } = {}) {
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db
    .prepare(
      `SELECT id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
       FROM projects
       ${where}
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .all()

  return (result.results || []).map(toProject)
}

export async function getProject(db, id, { includeDrafts = false } = {}) {
  const row = await db
    .prepare(
      `SELECT id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
       FROM projects
       WHERE id = ? ${includeDrafts ? '' : "AND status = 'published'"}`,
    )
    .bind(id)
    .first()

  return toProject(row)
}

export async function upsertProject(db, input) {
  const project = toDbProject(input)
  const timestamp = nowIso()

  if (!project.id || !project.title || !project.description || !project.type) {
    const error = new Error('Project id, title, description, and type are required.')
    error.status = 400
    throw error
  }

  await db
    .prepare(
      `INSERT INTO projects (
        id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at = excluded.updated_at`,
    )
    .bind(
      project.id,
      project.title,
      project.description,
      project.tech_stack,
      project.live_url,
      project.source_url,
      project.image_url,
      project.image_filename,
      project.type,
      project.sort_order,
      project.status,
      timestamp,
      timestamp,
    )
    .run()

  return getProject(db, project.id, { includeDrafts: true })
}

export async function deleteProject(db, id) {
  await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
  return { id }
}
