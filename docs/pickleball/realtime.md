# Devlab Pickleball — Realtime

One Durable Object instance per session (`SessionCoordinatorDO`, keyed by
`idFromName(sessionId)`) serializes every mutating command for that session
and broadcasts a full state snapshot to every connected WebSocket client
after each successful mutation. See
`docs/architecture/decisions/0006-pickleball-durable-objects.md` for why a
DO was chosen over, e.g., D1 optimistic locking.

## Channels

- **Operator channel** — `GET /pickleball/rt/:sessionId`, requires the
  signed session cookie (`requirePickleballSession`) and an active
  membership in the session's organization. The Astro route resolves and
  authorizes the session first, then forwards the upgrade request to the DO
  with `X-Pickleball-Channel: operator` and `X-Pickleball-Session-Id`
  headers — the query-string forms described in earlier design drafts
  (`?role=operator`) were not what shipped. Carries the full internal state:
  registration/attendance detail, queue internals, audit-adjacent fields
  (never raw emails beyond what the role already sees via REST).
- **Public channel** — `GET /pickleball/rt/public/:code`, no auth required.
  Resolves the public code to a session via `public_session_tokens`
  (404 if unknown, revoked, or `public_view_enabled` is off), then forwards
  to the DO with `X-Pickleball-Channel: public`. As with the operator
  channel, the code is a path segment (`/pickleball/rt/public/:code`), not
  a `?code=` query parameter. Carries a strictly sanitized DTO built by a
  dedicated `toPublicSessionView(state)` allowlist mapper (never the
  internal shape with fields stripped — so a newly added internal field can
  never leak by omission): court states, team display names, scores,
  serving side, session name/status, and a sanitized leaderboard (display
  name, OPI, rank, confidence tier only).

## Wire format

Every message is `{ type: 'STATE', sessionId, seq, payload: <full snapshot> }`
— a full-snapshot-not-diff protocol by design (Decision 3 of the realtime
design), so a client never needs merge/patch logic: on any message, replace
the whole local view with `payload`. `seq` is an in-memory monotonic counter
that resets to 0 whenever the DO hibernates and wakes fresh; it is
informational only (useful for debugging/ordering in logs) and clients never
compare it against a prior value, because every message already carries a
complete snapshot rather than a diff to reconcile. `useSessionRealtime`
(`src/pickleball-app/lib/useSessionRealtime.js`) reads only `parsed.payload`
off each `STATE` message and ignores `sessionId`/`seq` entirely.

## Reconnect behavior

`useSessionRealtime` (`src/pickleball-app/lib/useSessionRealtime.js`) opens
the socket, tracks `status` (`'connecting' | 'open' | 'closed'`), and on
close reconnects with capped exponential backoff
(`nextBackoffDelayMs`: 1s, 2s, 4s, capped at 8s), keeping the last known
snapshot visible rather than blanking the UI. A reconnect always gets a
fresh full snapshot from the DO — there is no resync protocol to get wrong,
because D1 already holds the true state regardless of client connectivity
(§57 edge case #24).

The public live view and TV/kiosk display additionally fall back to polling
`GET /api/pickleball/public/:code/state` every 5 seconds whenever the socket
isn't `'open'` (`usePublicSessionView`,
`src/pickleball-app/lib/usePublicSessionView.js`) — graceful degradation so
a public viewer's screen keeps advancing during a socket outage instead of
freezing (spec §9).

## Concurrency guarantee

Because the DO processes one request at a time, two simultaneous
court-assignment calls for the same session are naturally serialized: the
second call's reads already reflect the first call's writes. This is what
makes `assignCourt` safe against a player being assigned to two courts at
once without any client-side button-disabling — see the concurrency e2e
test in `tests/e2e/pickleball/pickleball-queue.spec.js`.
