// See this plan's Ruling C -- only what session-creation (Task 3 Step 6)
// and the public routes (this task's Steps 7/8, Task 7) actually call.
// Rotate/revoke can be added when a route needs one.

function generatePublicCode() {
  // ~40 bits of entropy -- plenty for a code that only needs to be
  // unguessable-by-brute-force at conversational scale, backed by the
  // table's real UNIQUE(public_code) constraint as the actual guarantee.
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

/**
 * Unexecuted INSERT for a new public session token, generating its own code
 * so a batch caller (session creation) never needs to pre-check uniqueness
 * itself -- the table's UNIQUE(public_code) index is the real guarantee. A
 * batched statement can't retry after a collision the way a standalone call
 * could, but at 10 hex chars of entropy that's accepted as a non-issue.
 */
export function buildCreatePublicSessionTokenStatement(db, sessionId, timestamp) {
  return db
    .prepare(`INSERT INTO public_session_tokens (id, session_id, public_code, created_at) VALUES (?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), sessionId, generatePublicCode(), timestamp)
}

// Resolves a public code straight to a public-safe session shape in ONE
// query -- deliberately NOT built on top of getSessionById/getSession, so
// there is no code path here that could ever select (and so leak)
// organization_id or created_by_user_id. Revoked or unknown codes both
// resolve to null; callers 404 either way (spec: "revoked tokens 404").
// The JOIN to organizations exists ONLY to gate on status != 'SUSPENDED' --
// organization_id itself is never in the SELECT list or the returned shape,
// so a suspended org's session resolves to null exactly like a revoked or
// unknown code does, keeping every caller's existing "not found" handling
// as the one code path for "nothing to show here" (a super-admin suspending
// an org must also stop its public spectator view from serving live data).
export async function getSessionByPublicCode(db, code) {
  const row = await db
    .prepare(
      `SELECT s.id, s.name, s.session_type, s.status, s.public_view_enabled, s.public_leaderboard_enabled
       FROM public_session_tokens t
       JOIN pickleball_sessions s ON s.id = t.session_id
       JOIN organizations o ON o.id = s.organization_id
       WHERE t.public_code = ? AND t.revoked_at IS NULL AND o.status != 'SUSPENDED'`,
    )
    .bind(code)
    .first()
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    sessionType: row.session_type,
    status: row.status,
    publicViewEnabled: Boolean(row.public_view_enabled),
    publicLeaderboardEnabled: Boolean(row.public_leaderboard_enabled),
  }
}

// Tenancy-safe lookup for the operator UI: joins through pickleball_sessions
// so a caller can never resolve another org's session's code by guessing a
// session id -- same tenancy pattern as getSession's own organization_id
// filter.
export async function getPublicCodeForSession(db, sessionId, organizationId) {
  const row = await db
    .prepare(
      `SELECT t.public_code
       FROM public_session_tokens t
       JOIN pickleball_sessions s ON s.id = t.session_id
       WHERE t.session_id = ? AND s.organization_id = ? AND t.revoked_at IS NULL`,
    )
    .bind(sessionId, organizationId)
    .first()
  return row ? row.public_code : null
}
