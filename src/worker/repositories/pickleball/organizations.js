import { nowIso } from '../../utils/responses.js'

function toOrganization(row) {
  if (!row) return null
  return { id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at, updatedAt: row.updated_at }
}

export async function getOrganization(db, id) {
  const row = await db.prepare('SELECT id, name, slug, created_at, updated_at FROM organizations WHERE id = ?').bind(id).first()
  return toOrganization(row)
}

export async function createOrganization(db, { name, slug }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare('INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, name, slug, timestamp, timestamp)
    .run()

  return getOrganization(db, id)
}
