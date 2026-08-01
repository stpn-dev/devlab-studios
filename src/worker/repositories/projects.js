import { nowIso, parseJsonField } from '../utils/responses'

function isMissingGalleryTableError(error) {
  return /no such table:\s*project_gallery_images/i.test(String(error?.message || ''))
}

function toGalleryImage(row) {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename || '',
    altText: row.alt_text || '',
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toProject(row, galleryImages = []) {
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
    galleryImages,
    type: row.type,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeGalleryImages(input) {
  if (!Array.isArray(input)) return []

  return input
    .map((item, index) => ({
      id: String(item?.id || crypto.randomUUID()).trim(),
      url: String(item?.url || '').trim(),
      filename: String(item?.filename || '').trim(),
      altText: String(item?.altText || '').trim(),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index + 1,
    }))
    .filter((item) => item.url)
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

async function listGalleryImagesForProjects(db, projectIds) {
  if (!projectIds.length) return new Map()

  try {
    const placeholders = projectIds.map(() => '?').join(', ')
    const result = await db
      .prepare(
        `SELECT id, project_id, url, filename, alt_text, sort_order, created_at, updated_at
         FROM project_gallery_images
         WHERE project_id IN (${placeholders})
         ORDER BY project_id ASC, sort_order ASC, created_at ASC`,
      )
      .bind(...projectIds)
      .all()

    const byProjectId = new Map()
    for (const row of result.results || []) {
      const item = toGalleryImage(row)
      const current = byProjectId.get(row.project_id) || []
      current.push(item)
      byProjectId.set(row.project_id, current)
    }

    return byProjectId
  } catch (error) {
    if (isMissingGalleryTableError(error)) return new Map()
    throw error
  }
}

async function listGalleryImagesForProject(db, projectId) {
  const byProjectId = await listGalleryImagesForProjects(db, [projectId])
  return byProjectId.get(projectId) || []
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

  const rows = result.results || []
  const galleryByProjectId = await listGalleryImagesForProjects(
    db,
    rows.map((row) => row.id),
  )

  return rows.map((row) => toProject(row, galleryByProjectId.get(row.id) || []))
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

  const galleryImages = row ? await listGalleryImagesForProject(db, row.id) : []
  return toProject(row, galleryImages)
}

/**
 * Runs the delete + every insert as a single db.batch() transaction —
 * see repositories/testimonials.js's replaceTestimonials for why a bare
 * DELETE followed by a sequential .run() loop is unsafe on D1.
 */
async function syncProjectGallery(db, projectId, galleryImages) {
  const normalizedImages = normalizeGalleryImages(galleryImages)

  try {
    const timestamp = nowIso()
    const statements = [db.prepare('DELETE FROM project_gallery_images WHERE project_id = ?').bind(projectId)]

    for (const image of normalizedImages) {
      statements.push(
        db
          .prepare(
            `INSERT INTO project_gallery_images (
              id, project_id, url, filename, alt_text, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            image.id,
            projectId,
            image.url,
            image.filename,
            image.altText,
            image.sortOrder,
            timestamp,
            timestamp,
          ),
      )
    }

    await db.batch(statements)
  } catch (error) {
    if (isMissingGalleryTableError(error) && normalizedImages.length === 0) return
    if (isMissingGalleryTableError(error)) {
      const migrationError = new Error('Project gallery migration is missing. Apply migrations/0002_project_gallery_images.sql first.')
      migrationError.status = 503
      throw migrationError
    }
    throw error
  }
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

  await syncProjectGallery(db, project.id, input.galleryImages)

  return getProject(db, project.id, { includeDrafts: true })
}

export async function deleteProject(db, id) {
  await db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run()
  return { id }
}
