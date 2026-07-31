# 2. Schema-driven CMS with Zod, versioning, and an audit log

**Status:** Accepted (Phase 4, extended in the Phase 4 debt cleanup)

## Context

The explicit brief for the admin rebuild: "do not extend the existing
admin as ad-hoc CRUD screens... refactor and extend it as a small,
schema-driven headless CMS, benchmarked against the structural,
editorial, and user-interface patterns used by mature CMS platforms"
(Sanity/Contentful/Strapi/TinaCMS/Decap/Directus/WordPress conventions —
not a visual clone of any one of them).

## Decision

- **Zod schemas validate, field-descriptor arrays describe how to render
  a form** — deliberately two separate things, not one generated from the
  other via runtime Zod introspection. `src/lib/schemas/*.ts` is the
  validation contract; `src/admin-app/lib/fieldDescriptors.js` /
  `blockFieldDescriptors.js` describe forms.
- Two collection editing modes depending on what the data actually is:
  **replace-all** (whole-array delete+reinsert — testimonials,
  certifications) where there's no natural per-row identity update
  pattern in the repository, and **per-item** (real id-based CRUD —
  redirects, case studies) where there is.
- Every save goes through `recordVersion` (append-only,
  whole-snapshot) and `recordAuditEvent` (actor/action/entity/timestamp),
  generic across content types by a `contentType` string key
  (`src/worker/repositories/contentVersions.js`, `auditLog.js`).
  Rollback re-applies an old snapshot as a **new** version — it never
  rewrites history.
- **Not every editor got rewritten onto the generic `SchemaForm`.** Five
  content types (projects, services, resources, profile, site-settings,
  seo) predate this system and kept their bespoke UIs — an icon picker, a
  resource-post master-detail library with search/filter, project image
  upload with WebP conversion. A generic flat form would have been a real
  UX regression for these, and rewriting ~3,200 lines of working, curated
  UI wasn't what the brief actually required. What they were missing
  (version history, audit logging, validated saves) was wired into their
  existing save paths and endpoints instead — see the Phase 4 debt
  cleanup commit for the mechanics (`adminRegistry.js`'s
  `SINGLETON_CONTENT_TYPES` map, a Version History panel added
  page-level for singletons and per-project inside `ProjectsManager`).

## Consequences

- New content types (case studies, testimonials — both intentionally
  shipping with zero rows until real content exists) got the full
  schema-driven treatment from day one; nothing bespoke to maintain there.
- The five legacy content types still don't get Zod-validated payloads
  (their repositories do defensive coercion instead, e.g.
  `Array.isArray(x) ? x : []`) — a real, acknowledged gap, not a silent
  one. Writing precise Zod schemas for their deeply-nested, historically
  loosely-typed shapes was judged higher-risk (breaking a working save
  path with an overly strict schema) than the validation gap itself, for
  now.
- Two real bugs were caught by this system doing its job during
  development: a duplicate `id`/`htmlFor` bug in `SchemaForm` across list
  items (found via a Playwright test filling the wrong field), and a
  `.optional()` vs `.nullable().optional()` Zod mismatch that broke every
  re-save of an existing row with a null foreign key.
