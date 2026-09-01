import { nowIso } from '../../utils/responses.js'

function toUser(row) {
  if (!row) return null
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getUserByGoogleSub(db, googleSub) {
  const row = await db
    .prepare('SELECT id, google_sub, email, name, avatar_url, created_at, updated_at FROM users WHERE google_sub = ?')
    .bind(googleSub)
    .first()
  return toUser(row)
}

export async function upsertUserByGoogleSub(db, { googleSub, email, name, avatarUrl }) {
  const existing = await getUserByGoogleSub(db, googleSub)
  const timestamp = nowIso()

  if (existing) {
    await db
      .prepare('UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
      .bind(email, name, avatarUrl || '', timestamp, existing.id)
      .run()
    return getUserByGoogleSub(db, googleSub)
  }

  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, googleSub, email, name, avatarUrl || '', timestamp, timestamp)
    .run()

  return getUserByGoogleSub(db, googleSub)
}

export async function isPlatformAdmin(db, userId) {
  const row = await db.prepare('SELECT is_platform_admin FROM users WHERE id = ?').bind(userId).first()
  return Boolean(row?.is_platform_admin)
}
