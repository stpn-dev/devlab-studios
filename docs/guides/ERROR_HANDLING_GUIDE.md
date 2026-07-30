# Error Handling Implementation Guide

This site includes a scalable, user-safe error-handling system that prioritizes
clear messaging, polished fallbacks, and production-ready behavior on its
current Cloudflare Worker + `react-router-dom` (BrowserRouter) deployment.

> Moved into `docs/guides/` and corrected during the 2026-07-30 housekeeping
> pass. Previously this doc described a GitHub Pages/HashRouter deployment and
> referenced `src/services/api/apiClient.js`, both of which no longer reflect
> reality — see [../CURRENT_STATE.md](../CURRENT_STATE.md).

## Overview

- 404 Page — Clean "Page Not Found" with quick links
- Maintenance Mode — Toggle with `VITE_MAINTENANCE_MODE=true`
- Global Error Boundary — Catches UI crashes and shows fallback UI
- Reusable Error Components — `ErrorState`, `EmptyState`
- Configuration-driven — Error copy in `src/config/errorMessages.js`
- SPA Routing — handled by the Cloudflare Worker's asset fallback, not a
  client-side hash/404 trick

## File Structure

```
src/
├── components/
│   ├── ErrorBoundary.jsx          # Global error boundary wrapper
│   └── ui/
│       ├── ErrorState.jsx         # Reusable error UI card
│       └── EmptyState.jsx         # Reusable empty state UI card
├── config/
│   └── errorMessages.js           # Centralized error message text
├── constants/
│   └── errorTypes.js              # Error type enums & HTTP codes
├── pages/
│   └── errors/
│       ├── NotFound.jsx           # 404 page
│       └── Maintenance.jsx        # Maintenance mode page
└── utils/
    └── errorHandler.js            # Utility functions for safe error handling
```

---

## Maintenance Mode

Enable maintenance UI globally via env var (dev and prod builds):

```env
VITE_MAINTENANCE_MODE=true
```

- Behavior: `src/App.jsx` swaps every route's element to the `Maintenance`
  page at router-definition time when this flag is `true` (build/runtime env,
  evaluated once — not per-request).
- Disable by setting `VITE_MAINTENANCE_MODE=false` (default).
- Use for planned downtime, breaking changes, or dependency incidents.

Guidance:
- Keep copy short, calm, and actionable (link to Contact).
- Avoid technical jargon or exposing internal error details.

---

## Global Error Boundary

Purpose: Catch unexpected React render errors and show a friendly fallback.

```jsx
<ErrorBoundary>
  <PageContent />
</ErrorBoundary>
```

`App.jsx` wraps the entire `RouterProvider` in a single top-level
`ErrorBoundary`.

Best practices:
- Do not show stack traces in the UI.
- Keep fallback light: clear message, button to recover.

---

## API / Content Fetch Error Handling

There is **no shared API client wrapper** — each content domain has its own
hook in `src/hooks/` (`useProfileContent`, `useServicesContent`,
`useResourcesContent`, `useSiteSettingsContent`, `usePageSeo`, `useProjects`)
that:

1. Returns the bundled static content (`src/data/*.js`) immediately.
2. Fetches the matching `/api/*` endpoint via `fetchJsonOnce()`
   (`src/utils/cachedFetch.js`), which simply dedupes in-flight/completed
   requests per URL.
3. Swaps in the live data only if the Worker responds with
   `configured: true`; on any fetch failure the static fallback is what stays
   on screen — there's no separate error UI shown to the visitor for this
   path, since the fallback content is already valid content.

The `ErrorState`/`EmptyState` components below are for section-level failures
where there is genuinely nothing to show (e.g. an admin CRUD action failing),
not for the public-page content-fetch path described above.

---

## Reusable Error UI

- `components/ui/ErrorState.jsx` — Display contextual error messages within a
  section/card.
- `components/ui/EmptyState.jsx` — Show a calm empty state when no data is
  available.

Guidelines:
- Keep iconography subtle; use `aria-hidden="true"` for decorative icons.
- Ensure text alone conveys meaning (accessible by screen readers).
- Offer a next step (reload, go home, contact) without overwhelming the UI.

---

## Configuration-Driven Messages

Put all user-facing error strings in `src/config/errorMessages.js`. Reference
them via types defined in `src/constants/errorTypes.js`.

```js
// errorTypes.js
export const ERROR_TYPES = {
  NETWORK: 'NETWORK',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN: 'UNKNOWN',
}

// errorMessages.js
export const ERROR_MESSAGES = {
  NETWORK_ERROR: {
    title: 'Connection Error',
    message: 'Unable to connect. Please check your internet and try again.',
  },
  // ...
}
```

---

## SPA Routing

`react-router-dom`'s `createBrowserRouter` handles client-side routing.
Server-side, `wrangler.jsonc` configures the Worker's static asset binding
with `not_found_handling: "single-page-application"`, so any request path
that doesn't match a built file in `dist/` falls through to `index.html` and
the client router takes over — no hash-based routing or custom 404 rewrite
file is needed.

Invalid routes (e.g. `/kl`) match the catch-all `{ path: '*', element:
lazyPage(NotFound) }` route in `src/App.jsx`.

---

## Testing & Verification

Checklist before deploying:

1. **Maintenance toggle** — `VITE_MAINTENANCE_MODE=true` shows Maintenance on
   every route except `/contact`; `false` restores normal routing.
2. **Routing/404** — `/about` renders About; `/kl` (or any unknown path)
   renders NotFound; refreshing on a deep route works (Worker SPA fallback).
3. **Error Boundary** — intentionally throw in a child component → fallback
   UI shows without a hard crash.
4. **Content fetch fallback** — with the D1 binding empty/unset, every page
   still renders full content via the static fallback (`/api/health` reports
   `hasDb: false`).
5. **Accessibility** — keyboard-only navigation reaches all actions; screen
   reader announces error/empty states; reduced-motion users see no
   animation-dependent content.

---

## Operational Guidance

- Keep error copy calm, short, and actionable.
- Avoid exposing technical details (stack traces, endpoints, IDs) to the UI.
- Prefer qualitative assurances (what users can do next) over raw diagnostics.

## Future Enhancements

- Centralized client-side error telemetry (with redaction).
- Per-route error boundaries for finer-grained recovery.
- Localized error messages with i18n.
