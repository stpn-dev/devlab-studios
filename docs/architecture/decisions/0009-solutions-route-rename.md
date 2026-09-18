# 9. Renaming /services to /solutions, and why the redirect is in code

**Status:** Accepted (Phase 10)

## Context

Every visible surface called the page "Solutions" — the navigation label, the
`<h1>`, the breadcrumb, the schema.org entries, the admin's own page registry,
and the SEO record's `meta_title`. The route was `/services`.

That inconsistency was survivable on its own. What made it a defect was the
chain it had produced:

- The CMS SEO record was keyed `page_slug = 'solutions'` with
  `canonical_url = https://www.devlabstudios.com/solutions`. That URL returned
  **404**.
- `services.astro` called `loadPageSeo('services')`, found no row, and fell
  back to the static file. `loadPageSeo` falls back **silently**, so every edit
  an admin made on that screen was accepted and discarded, with no signal.
- The Insights record had the same problem for a different reason: its slug was
  misspelled `'insigths'`.
- `/process`, `/privacy`, `/terms` and `/insights/daily` had no record at all,
  and the admin screen had no way to create one.

So the rename is not cosmetic tidying. It is the change that makes the CMS
record and the route agree, which is what stops the silent discard.

## Decision

**The route is `/solutions`.** `services.astro` becomes `solutions.astro`, and
the page slug used by `loadPage` / `loadPageSeo` moves with it. The existing
`seo_metadata` row, already keyed `solutions`, becomes correct rather than
aspirational.

**`/services` returns a 301, from code, not from the CMS.** The project already
has a D1 `redirects` table with an admin screen, and it is the right mechanism
for editorial redirects. It is the wrong mechanism here for two reasons:

1. It is editable from the admin. One accidental delete would turn an
   externally-linked URL into a 404, with no review and no deploy.
2. It is only consulted **on a 404**, after routing has already failed. A
   permanent rename should not depend on the destination missing first.

`PERMANENT_PATH_REDIRECTS` in `src/middleware.ts` is checked before routing and
before the admin gate. A rename is an architectural fact, so it lives with the
architecture.

**Content-type keys did NOT move.** `faqs.page_slug = 'services'` and the
`/admin/content/services` Service Catalog content type keep their names. Those
are internal identifiers, not URLs. Public routes moved; keys did not. Moving
both would have meant a second data migration and a change to the Service
Catalog editor for no visible benefit.

**A test now enforces coverage.** `src/lib/content/seo.test.ts` asserts that
every route in `src/config/publicRoutes.ts` has a static SEO record and that no
record declares a canonical URL pointing somewhere other than its own route. It
found the four missing records on its first run, which is the argument for it.

`loadPageSeo` also logs `{"event":"seo_lookup","outcome":"no_record"}` when it
falls back. Falling back is correct; doing it invisibly is what hid this.

## Consequences

- Anything linking to `/services` keeps working, permanently, and search engines
  are told the move is permanent.
- The redirect cannot be removed from the admin. Changing it requires a code
  change and a deploy, which is the intent.
- `PERMANENT_PATH_REDIRECTS` is a map, so the next rename costs one line. It
  should stay small — it is for renames of published routes, not for editorial
  redirects, which still belong in the CMS table.
- The SEO coverage test will fail when a route is added to `publicRoutes.ts`
  without a matching record. That is the point, and it is the cheapest moment
  to notice.
