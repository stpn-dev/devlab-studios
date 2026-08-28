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

// TRUSTED-INTERNAL ONLY — no organization_id filter. Safe only because its
// sole caller is Task 6's SessionCoordinatorDO, which has no notion of
// "organization" at all: the DO is keyed by session_id and the org check
// already happened one layer up, in the API route that resolved the
// session_id from the authenticated user's org before ever messaging the
// DO. Do NOT export this from, or call this from, any API route directly —
// a route must keep using `getSession(db, id, organizationId)` above, which
// enforces tenancy. This function exists purely so the DO (which cannot
// apply that filter itself) can still load session state by id.
export async function getSessionById(db, id) {
  const row = await db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM pickleball_sessions WHERE id = ?`)
    .bind(id)
    .first()
  return toSession(row)
}

function toScoringRuleset(row) {
  if (!row) return null
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    targetScore: row.target_score,
    winBy: row.win_by,
    format: row.format,
    active: Boolean(row.active),
  }
}

const SCORING_RULESET_COLUMNS = 'id, organization_id, name, target_score, win_by, format, active'

// Tenancy guard for a client-supplied scoring_ruleset_id. `organization_id`
// is nullable on scoring_rulesets: NULL means a global built-in profile every
// org may reference, anything else is that org's private ruleset. Without the
// `(IS NULL OR = ?)` clause, org B could attach org A's private ruleset to its
// own session — the same IDOR class as the venue/court cross-tenant bug.
export async function getScoringRuleset(db, id, organizationId) {
  const row = await db
    .prepare(
      `SELECT ${SCORING_RULESET_COLUMNS}
       FROM scoring_rulesets
       WHERE id = ? AND (organization_id IS NULL OR organization_id = ?)`,
    )
    .bind(id, organizationId)
    .first()
  return toScoringRuleset(row)
}

// Same tenancy rule as getScoringRuleset (a NULL organization_id is a global
// built-in every org may use): every global ruleset plus this org's own
// ACTIVE ones only — an admin-deactivated custom ruleset (Settings page)
// must stop appearing as a session-creation choice without deleting it,
// since historical games keep referencing it by id (spec §4.3).
export async function listScoringRulesets(db, organizationId) {
  const result = await db
    .prepare(
      `SELECT ${SCORING_RULESET_COLUMNS}
       FROM scoring_rulesets
       WHERE organization_id IS NULL OR (organization_id = ? AND active = 1)
       ORDER BY organization_id IS NULL DESC, name ASC`,
    )
    .bind(organizationId)
    .all()
  return (result.results || []).map(toScoringRuleset)
}

// The org's OWN rulesets, active and inactive alike — the Settings page
// (spec §3.4's "Configure system defaults") needs to show a deactivated
// ruleset too, so an admin can reactivate it. Deliberately excludes global
// (organization_id IS NULL) rows: those are read-only built-ins, never
// editable from here.
export async function listOrganizationScoringRulesets(db, organizationId) {
  const result = await db
    .prepare(
      `SELECT ${SCORING_RULESET_COLUMNS}
       FROM scoring_rulesets
       WHERE organization_id = ?
       ORDER BY name ASC`,
    )
    .bind(organizationId)
    .all()
  return (result.results || []).map(toScoringRuleset)
}

export async function createScoringRuleset(db, organizationId, { name, targetScore, winBy, format }) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await db
    .prepare(
      `INSERT INTO scoring_rulesets
         (id, organization_id, name, rules_version, scoring_method, target_score, win_by, format, active, created_at, updated_at)
       VALUES (?, ?, ?, 'ORG-CUSTOM-1', 'SIDE_OUT', ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, organizationId, name, targetScore, winBy, format, timestamp, timestamp)
    .run()

  return getScoringRuleset(db, id, organizationId)
}

// Org-scoped by construction (the WHERE clause matches only rows this org
// owns), so this can never edit a global built-in or another org's ruleset —
// same tenancy guard shape as getScoringRuleset/listScoringRulesets above.
export async function updateScoringRuleset(db, id, organizationId, { name, targetScore, winBy, active }) {
  const existing = await db
    .prepare(`SELECT ${SCORING_RULESET_COLUMNS} FROM scoring_rulesets WHERE id = ? AND organization_id = ?`)
    .bind(id, organizationId)
    .first()
  if (!existing) return null

  await db
    .prepare(
      `UPDATE scoring_rulesets SET name = ?, target_score = ?, win_by = ?, active = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
    )
    .bind(
      name ?? existing.name,
      targetScore ?? existing.target_score,
      winBy ?? existing.win_by,
      active === undefined ? existing.active : active ? 1 : 0,
      nowIso(),
      id,
      organizationId,
    )
    .run()

  return getScoringRuleset(db, id, organizationId)
}

// Compare-and-swap: the caller (the status route) has already read the
// session and validated the state-machine transition against `fromStatus` a
// moment earlier. Binding `fromStatus` into the WHERE clause means a second,
// concurrent transition that raced against the same stale read cannot also
// win — only the request whose `fromStatus` still matches the row's current
// status at write time succeeds. A changes-count of 0 means either the row
// vanished or (far more commonly) another transition already moved it past
// `fromStatus`; both collapse to `null`, which is fine because the caller
// already knows the row existed a moment earlier and can respond 409.
export async function updateSessionStatus(db, id, organizationId, fromStatus, toStatus) {
  const result = await db
    .prepare(`UPDATE pickleball_sessions SET status = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND status = ?`)
    .bind(toStatus, nowIso(), id, organizationId, fromStatus)
    .run()
  if (!result.meta.changes) return null
  return getSession(db, id, organizationId)
}

// Returns a prepared-but-not-yet-run INSERT statement so the route can
// compose it into one `db.batch([...])` alongside the session-courts seed
// statements — see SessionCoordinatorDO.ts for the established build*Statement
// convention this follows. Running this statement alone (via `createSession`
// below) remains a valid, supported use.
export function buildCreateSessionStatement(db, {
  id, organizationId, venueId, name, sessionType, scoringRulesetId, scheduledStart, scheduledEnd, createdByUserId, timestamp,
}) {
  return db
    .prepare(
      `INSERT INTO pickleball_sessions (
        id, organization_id, venue_id, name, session_type, status, scoring_ruleset_id,
        scheduled_start, scheduled_end, post_game_rotation_policy, leaderboard_min_games,
        public_view_enabled, public_leaderboard_enabled, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, 'AUTO_REQUEUE_ALL', 3, 1, 1, ?, ?, ?)`,
    )
    .bind(id, organizationId, venueId, name.trim(), sessionType, scoringRulesetId, scheduledStart, scheduledEnd, createdByUserId, timestamp, timestamp)
}

export async function createSession(db, {
  organizationId, venueId, name, sessionType, scoringRulesetId, scheduledStart, scheduledEnd, createdByUserId,
}) {
  const id = crypto.randomUUID()
  const timestamp = nowIso()

  await buildCreateSessionStatement(db, {
    id, organizationId, venueId, name, sessionType, scoringRulesetId, scheduledStart, scheduledEnd, createdByUserId, timestamp,
  }).run()

  return getSession(db, id, organizationId)
}
