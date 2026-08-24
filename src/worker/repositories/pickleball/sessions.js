import { nowIso } from '../../utils/responses.js'

function toSession(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    venueId: row.venue_id,
    name: row.name,
    sessionType: row.session_type,
    status: row.status,
    scoringRulesetId: row.scoring_ruleset_id,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    postGameRotationPolicy: row.post_game_rotation_policy,
    leaderboardMinGames: row.leaderboard_min_games,
    publicViewEnabled: Boolean(row.public_view_enabled),
    publicLeaderboardEnabled: Boolean(row.public_leaderboard_enabled),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SESSION_COLUMNS = `id, organization_id, venue_id, name, session_type, status, scoring_ruleset_id,
  scheduled_start, scheduled_end, actual_start, actual_end, post_game_rotation_policy,
  leaderboard_min_games, public_view_enabled, public_leaderboard_enabled, created_by_user_id, created_at, updated_at`

export async function listSessions(db, organizationId) {
  const result = await db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM pickleball_sessions WHERE organization_id = ? ORDER BY scheduled_start DESC`)
    .bind(organizationId)
    .all()
  return (result.results || []).map(toSession)
}

export async function getSession(db, id, organizationId) {
  const row = await db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM pickleball_sessions WHERE id = ? AND organization_id = ?`)
    .bind(id, organizationId)
    .first()
  return toSession(row)
}

export async function createSession(db, {
  organizationId, venueId, name, sessionType, scoringRulesetId, scheduledStart, scheduledEnd, createdByUserId,
}) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO pickleball_sessions (
        id, organization_id, venue_id, name, session_type, status, scoring_ruleset_id,
        scheduled_start, scheduled_end, post_game_rotation_policy, leaderboard_min_games,
        public_view_enabled, public_leaderboard_enabled, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, 'AUTO_REQUEUE_ALL', 3, 1, 1, ?, ?, ?)`,
    )
    .bind(id, organizationId, venueId, name.trim(), sessionType, scoringRulesetId, scheduledStart, scheduledEnd, createdByUserId, timestamp, timestamp)
    .run()

  return getSession(db, id, organizationId)
}
