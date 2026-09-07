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
3. **Auth** — Google OAuth 2.0 + PKCE, hand-rolled against `fetch` and the
   Web Crypto API (no `arctic` dependency — matches `adminAuth.js`'s own
   hand-rolled-crypto convention; see the Phase 1 foundation plan for the
   rationale). A stateless
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
5. **Standings vs. OPI snapshots** — two deliberately different read models
   over the same facts. `player_performance_snapshots` is the OPI store: a
   row exists only once a player has finished an eligible game, which is the
   right shape for an all-time leaderboard and the wrong one for a live
   session board (it renders empty for the whole first game of every
   session). The operator Standings page therefore reads
   `listSessionStandings()`
   (`src/worker/repositories/pickleball/sessionStandings.js`), which starts
   from the attending roster and left-joins the snapshot, per-game W/L and
   point totals, and an on-court flag; ranking is applied by the pure
   `rankStandings()` (`src/lib/pickleball/standings.ts`). OPI itself is
   unchanged: eligibility is still FINISHED games only, so an unplayed
   player carries a null OPI and no rank rather than a misleading zero, and
   an in-progress score never contributes. `leaderboard_min_games` still
   decides who is *ranked* — it no longer decides who is *visible*.
6. **Public pages** — `/pickleball` (landing) and `/pickleball/how-it-works`
   (a nine-step operator walkthrough) are plain Astro on the shared dark
   public shell, alongside `/pickleball/methodology`. Their artwork is
   hand-authored SVG under `src/components/pickleball/art/`, imported into
   `.astro` with **no** `client:*` directive, so the pages ship zero
   JavaScript for illustration; the only hydrated island is the
   request-access `ContactForm`, mounted `client:visible`. Two conventions
   these pages must keep: they render inside `Layout.astro`'s own `<main>`
   and must not open a second one, and **every factual claim in their copy
   has to map to committed code.** Ten claims that did not were caught in
   review before ship — the guard against a recurrence is
   `tests/e2e/pickleball/pickleball-public-pages.spec.js`, which pins the
   corrected phrasings verbatim, blocks copy about features that exist only
   as API routes, and asserts the artwork never gains a hydration directive.

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
| 7 | Polish — audit log, operator management UI, dashboard consolidation, documentation | Complete |

**Deliberately not built** (disclosed, not overlooked): `pair_stats` /
`FIXED_PAIRS` session-type support (a full future feature, not a stats-layer
addition — deferred, a full future feature, not a stats-layer addition); the public sanitized leaderboard extension to
`toPublicSessionView` (spec §9 — deferred, requires a backend change out of
scope for the UI-only plan that shipped the rest of Phase 6); a `/settings`
page for "system defaults" (the spec reserves the route and a permission but
never defines a single concrete setting).
