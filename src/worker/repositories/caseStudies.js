import { nowIso, parseJsonField } from '../utils/responses'

function normalizeString(value) {
  return String(value || '').trim()
}

function normalizeStringArray(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => normalizeString(item)).filter(Boolean)
}

function normalizeStatus(value) {
  return value === 'published' || value === 'archived' ? value : 'draft'
}

function normalizeSortOrder(value, fallback = 999) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function toCaseStudy(row) {
  if (!row) return null

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary || '',
    clientName: row.client_name || '',
    industry: row.industry || '',
    problem: row.problem || '',
    constraints: row.constraints || '',
    architecture: row.architecture || '',
    implementation: row.implementation || '',
    integrations: parseJsonField(row.integrations_json, []),
    outcomes: row.outcomes || '',
    metrics: parseJsonField(row.metrics_json, []),
    screenshots: parseJsonField(row.screenshots_json, []),
    projectIds: parseJsonField(row.project_ids_json, []),
    testimonialId: row.testimonial_id || null,
    coverImageUrl: row.cover_image_url || '',
    isFeatured: Number(row.is_featured) === 1,
    sortOrder: Number(row.sort_order) || 999,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLUMNS = `id, slug, title, summary, client_name, industry, problem, constraints, architecture, implementation,
  integrations_json, outcomes, metrics_json, screenshots_json, project_ids_json, testimonial_id, cover_image_url,
  is_featured, sort_order, status, created_at, updated_at`

export async function listCaseStudies(db, { includeDrafts = false } = {}) {
  const where = includeDrafts ? '' : "WHERE status = 'published'"
  const result = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM case_studies ${where} ORDER BY sort_order ASC, updated_at DESC`)
    .all()
  return (result.results || []).map(toCaseStudy)
}

export async function getCaseStudy(db, slug, { includeDrafts = false } = {}) {
  const row = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM case_studies WHERE slug = ? ${includeDrafts ? '' : "AND status = 'published'"}`)
    .bind(slug)
    .first()
  return toCaseStudy(row)
}

export async function upsertCaseStudy(db, input) {
  const id = normalizeString(input.id) || crypto.randomUUID()
  const slug = normalizeString(input.slug) || id
  const title = normalizeString(input.title)

  if (!title) {
    const error = new Error('Case study title is required.')
    error.status = 400
    throw error
  }

  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO case_studies (
        id, slug, title, summary, client_name, industry, problem, constraints, architecture, implementation,
        integrations_json, outcomes, metrics_json, screenshots_json, project_ids_json, testimonial_id, cover_image_url,
        is_featured, sort_order, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        summary = excluded.summary,
        client_name = excluded.client_name,
        industry = excluded.industry,
        problem = excluded.problem,
        constraints = excluded.constraints,
        architecture = excluded.architecture,
        implementation = excluded.implementation,
        integrations_json = excluded.integrations_json,
        outcomes = excluded.outcomes,
        metrics_json = excluded.metrics_json,
        screenshots_json = excluded.screenshots_json,
        project_ids_json = excluded.project_ids_json,
        testimonial_id = excluded.testimonial_id,
        cover_image_url = excluded.cover_image_url,
        is_featured = excluded.is_featured,
        sort_order = excluded.sort_order,
        status = excluded.status,
        updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      slug,
      title,
      normalizeString(input.summary),
      normalizeString(input.clientName),
      normalizeString(input.industry),
      normalizeString(input.problem),
      normalizeString(input.constraints),
      normalizeString(input.architecture),
      normalizeString(input.implementation),
      JSON.stringify(Array.isArray(input.integrations) ? input.integrations : []),
      normalizeString(input.outcomes),
      JSON.stringify(Array.isArray(input.metrics) ? input.metrics : []),
      JSON.stringify(Array.isArray(input.screenshots) ? input.screenshots : []),
      JSON.stringify(normalizeStringArray(input.projectIds)),
      normalizeString(input.testimonialId) || null,
      normalizeString(input.coverImageUrl),
      input.isFeatured ? 1 : 0,
      normalizeSortOrder(input.sortOrder, 999),
      normalizeStatus(input.status),
      timestamp,
      timestamp,
    )
    .run()

  return getCaseStudy(db, slug, { includeDrafts: true })
}

export async function deleteCaseStudy(db, id) {
  await db.prepare('DELETE FROM case_studies WHERE id = ?').bind(id).run()
  return { id }
}
