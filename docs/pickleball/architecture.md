# Devlab Pickleball — Architecture

Devlab Pickleball is an operational platform for running recreational pickleball
sessions: check-in, queueing, court assignment, live scoring, statistics, a
custom performance index (OPI), and anonymous realtime public viewing. It is
not CMS content — it lives beside the existing public website and Admin CMS as
a third, independent subsystem sharing one Astro/Worker deployment but nothing
else load-bearing: separate D1 database, separate auth mechanism, separate
session cookie, separate migrations, separate repositories, separate UI shell.

**Non-goal, stated everywhere this matters:** OPI is a Devlab-original metric,
not an official USA Pickleball rating, DUPR, UTR-P, or Elo system. The scoring
engine aligns with standard side-out scoring concepts but the software is not
USA-Pickleball-certified.

## Foundational pieces

1. **UI shell** — a React Router SPA island (`src/pickleball-app/`), mounted
   at `src/pages/pickleball/app/[...path].astro` (`client:only="react"`),
   mirroring the existing `admin-app/` pattern, for the authenticated operator
   experience. The public marketing/methodology pages are plain Astro. The
   public live view and TV/kiosk display are Astro pages with one React
   island each for the realtime-subscribing widget.
2. **Data isolation** — a dedicated D1 database, bound as `PICKLEBALL_DB`
   (prod: `devlab-pickleball`, preview: `devlab-pickleball-preview`). Own
   migrations folder `migrations/pickleball/`, own repositories
   `src/worker/repositories/pickleball/`, own Zod schemas
   `src/lib/schemas/pickleball/`.
3. **Auth** — Google OAuth 2.0 + PKCE via `arctic`. A stateless
   HMAC-SHA256-signed session cookie (`devlab_pb_session`), independent of
   the Admin CMS's password-based session. Memberships are invite-only: an
   ADMIN creates a membership row for an email before that person ever
   signs in.
4. **Realtime & concurrency** — one Durable Object per pickleball session
   (`SessionCoordinatorDO`), serializing every mutating command and
   broadcasting WebSocket diffs to operators and public viewers. D1 is the
   durable source of truth; the DO is a rehydratable coordinator, never the
   only copy of anything. See `docs/architecture/decisions/0006-pickleball-durable-objects.md`
   for why this pattern was introduced, and `realtime.md` for the wire
   protocol.

## Multi-tenancy & RBAC

- **Organization** — a club/venue operator's tenant. All operational data is
  scoped by `organization_id`.
- **User** — an authenticated operator, identified by Google `sub`.
- **OrganizationMembership** — join of User × Organization with a `role`
  (`ADMIN` | `SESSION_FACILITATOR` | `SCOREKEEPER`) and `status` (`ACTIVE` |
  `REVOKED`). A user can hold different roles in different organizations.
- **Player** — a session participant, not an authenticated entity; belongs
  to one organization, optionally links to a `user_id`.

Every mutating and non-public-read endpoint validates the session cookie,
resolves `(userId, activeOrgId)` → membership → role, and re-checks the
resource's actual owning org against the request (never trusting a
client-supplied `organization_id` blindly — an IDOR guard). The SPA hides
controls the role can't use, but every command handler re-checks permissions
independently server-side; see `src/lib/pickleball/permissions.ts` for the
full role→permission matrix.

## Phase history

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation — migrations, OAuth, orgs/users/memberships/RBAC, CRUD, empty SPA shell | Complete |
| 2 | Attendance — registration/check-in/availability | Complete |
| 3 | Open Play core — queue engine, `SessionCoordinatorDO` scaffolding, court assignment | Complete |
| 4 | Game engine — rulesets, side-out scoring, event log, undo, finalization, reopen/correction | Complete |
| 5 | Performance — `player_game_stats`, OPI v1, snapshots, leaderboards, player profile | Complete |
| 6 | Realtime & public — WebSocket broadcast, public live view, TV/kiosk display, QR sharing, methodology page | Complete |
| 7 | Polish — audit log, operator management UI, dashboard consolidation, documentation | Complete (this plan) |

**Deliberately not built** (disclosed, not overlooked): `pair_stats` /
`FIXED_PAIRS` session-type support (a full future feature, not a stats-layer
addition — see Phase 5's plan); the public sanitized leaderboard extension to
`toPublicSessionView` (spec §9 — deferred, requires a backend change out of
scope for the UI-only plan that shipped the rest of Phase 6); a `/settings`
page for "system defaults" (the spec reserves the route and a permission but
never defines a single concrete setting — see this plan's Global Constraints).
