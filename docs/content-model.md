# Content Model

Written 2026-07-31 as Phase 2 of the Astro/CMS rebuild, updated as Phase 4
(admin rebuild) landed. This documents the data layer (D1 schema,
TypeScript/Zod validation, repository functions) and, as of Phase 4, the
admin UI that edits it. Public pages consuming this data was Phase 3.

## Versioning & audit (cross-cutting, applies to everything below)

- **`content_versions`** — append-only, whole-snapshot. Every save of any
  content type writes `{content_type, content_id (null for singletons),
  version_number, status, snapshot_json, created_by, created_at}`. The
  per-type tables below keep representing **current state**, same as
  before this rebuild — this is a history/rollback layer on top, not a
  replacement read path. Rollback = re-save an old snapshot as a new
  version; history is never mutated. See `src/worker/repositories/contentVersions.js`.
- **`audit_log`** — one row per create/update/publish/unpublish/archive/
  restore/delete: `{actor_email, action, entity_type, entity_id,
  metadata_json, created_at}`. See `src/worker/repositories/auditLog.js`.
- **Wired in Phase 4** for everything that goes through the new generic
  admin routes: `api/admin/collections/[type]/*` (Testimonials,
  Certifications, Redirects, Case Studies) and `api/admin/pages/[slug]`
  (block-composed pages) call `recordVersion`/`recordAuditEvent` on every
  write, with a version-history panel + one-click rollback in the admin
  UI (`src/admin-app/pages/VersionHistoryPanel.jsx`) and a read-only audit
  log viewer (`AuditLogPage.jsx`). The 5 pre-existing bespoke editors
  (Projects, Services, Articles, Profile, Site Settings, SEO) were
  relocated into the new admin shell unchanged and do **not** yet call
  these — rewriting them onto the same generic infrastructure is open
  follow-up work.

## Singletons

| Singleton | Storage | Notes |
|---|---|---|
| Site Settings | `site_settings` key `site_general` (new key, not yet used) | Brand name, tagline, logos, default OG image, availability, legal links |
| Navigation | `navigation_items` table (existing) | Unchanged |
| Footer | `site_settings` key `site_footer` (existing) | Unchanged |
| Profile | `site_settings` key `profile_about` + `experiences`/`skills`/`tools`/`workflow_items` tables (existing) | Unchanged; references Experience/Certifications as their own collections rather than embedding |
| Homepage / About / Process | `pages` + `page_sections` tables | **Repurposed** — these tables existed since migration 0001 but were never used; they're structurally almost exactly the block-composition system this needed (`section_type` = block type, `content_json` = block props, `sort_order` = position). See `src/worker/repositories/pages.js`. |
| Contact | Fixed form component, not block-composed | The form itself isn't part of the block system — only surrounding intro copy would be, if added later |
| Privacy / Terms | Same `pages`/`page_sections` tables, but as a single `richText` block rather than a full block mix | Real content still needs to be drafted — ships as a stub page for now |

## Block system

Thirteen approved block types, each with its own Zod-validated props shape
(`src/lib/schemas/blocks.ts`): `hero`, `richText`, `stats`, `processSteps`,
`experienceTimeline`, `servicesGrid`, `featuredProjects`,
`featuredCaseStudies`, `testimonials`, `faq`, `resourceCards`,
`imageGallery`, `cta`. No arbitrary HTML/JS/CSS — editors can only
configure and reorder these, via the Phase 4 page builder
(`src/admin-app/pages/PageBuilderPage.jsx`, `api/admin/pages/[slug]`).
Each block's flat props render through the same schema-driven `SchemaForm`
every other admin screen uses; nested array/object props (CTAs, stat
items, gallery images) use a JSON escape hatch
(`src/admin-app/lib/blockFieldDescriptors.js`) rather than a bespoke
widget per shape — a reasonable follow-up once real content shows which
ones need it.

## Collections

| Collection | Table | Status |
|---|---|---|
| Services | `service_groups` (existing) | Unchanged |
| Projects | `projects` + `project_gallery_images` (existing) | Unchanged |
| Case Studies | `case_studies` (new) | **Ships empty** — no real content yet. Optionally references `projects` (via `project_ids_json`) and at most one `testimonials` row |
| Experience | `experiences` (existing) | Unchanged |
| Certifications | `certifications` (new) | **Seeded** (migration 0005) with the 4 real platform certificates Stephen provided: Zapier, Make.com, and n8n (all via Technical Virtual Assistants PH) and HighLevel CRM (via Tara AI Community+), each with a real badge image in `src/assets/certificates/` matched by id in `src/lib/content/profile.ts`. Rendered in its own "Platform Certifications" section on the Profile page, separate from `src/data/about.js`'s unrelated `certificatesAndLicenses` list (CCNA, Google, OWASP, CCSP), which still renders as plain text alongside it. |
| Testimonials | `testimonials` (new) | **Ships empty** — no real content yet |
| Articles | `articles` (renamed from `resources`) | See "The Articles/Resources split" below |
| Resources | `resources` (redefined) | See below — **ships empty**, nothing in today's content is actually downloads-shaped |
| FAQs | `faqs` (existing, `page_slug` column doubles as the "context" tag) | Unchanged — already generic, just needs consistent use across pages |
| Redirects | `redirects` (new) | **Seeded** (migration 0004) with the 2 redirects that existed at Phase 2 time (`/experiences`→`/profile`, `/portfolio`→`/profile`), but nothing reads this table at request time. Phase 3 implemented all 4 real redirects that exist today — those 2 plus `/resources`→`/insights` and `/resources/:slug`→`/insights/:slug` — as small dedicated `Astro.redirect()` pages (`src/pages/experiences.astro`, `portfolio.astro`, `resources.astro`, `resources/[slug].astro`) instead of reading the table, since that was simpler than generic pattern matching for a handful of known routes. Phase 4 added a real admin screen for this table (`/admin/collections/redirects`, full create/edit/delete with versioning + audit logging), so it's now genuinely manageable — but it's still not the runtime source of truth: wiring a real D1-backed redirect-serving middleware (so editing a row here actually changes routing behavior) is still open. |

### The Articles/Resources split

The original `resources` table (added in migration 0003: slug,
content_type, body_markdown, tags, author, published date, reading time)
is genuinely article/blog-shaped — it was never actually a "downloads"
collection despite the name. Per the agreed design:

- **`ALTER TABLE resources RENAME TO articles`** (migration 0004) — no data
  loss, same columns, same content.
- A **new**, separately-defined `resources` table is created for the real
  downloads/reference-material concept (`resource_type`: template /
  checklist / external-link / download).
- **Deliberately NOT renamed yet at the function/route/frontend level.**
  `src/worker/repositories/content.js`'s `listResources`/`replaceResources`/
  `getResourcesContent`/`replaceResourcesContent` still exist under those
  names and still power today's `/api/resources` route and
  `Resources.jsx` — they just now query the renamed `articles` table
  under the hood. This is a deliberate, documented bridge (same pattern as
  Phase 1's `honoShim.js`) so this migration doesn't break the
  already-shipped, tested Phase 1 site. The real rename — `/api/resources`
  → `/api/articles`, `Resources.jsx` → the new `/insights` Astro page —
  happens in Phase 3 alongside that page's actual rewrite.
- The new collection's own repository lives in
  `src/worker/repositories/resourceLibrary.js` (`listResourceLibrary`/
  `replaceResourceLibrary`), kept under clearly distinct names to avoid
  the same collision.
- **Open question carried over, not yet resolved**: does the new Resources
  collection get its own public route (e.g. `/resources`), or does it only
  power a `resourceCards` block embedded elsewhere (Process, Services)?
  Deferred to Phase 3 when the public IA actually gets built.

## Media

`media_assets` (D1 metadata for R2-hosted files: key, url, filename,
content_type, size, alt_text, folder) existed unused since migration 0001.
`src/pages/api/admin/media.ts` now writes a row here on every upload
(`src/worker/repositories/mediaAssets.js`) — failure to record metadata
doesn't fail the upload itself, since the R2 object is already the source
of truth for file bytes. Phase 4 added a `GET` on the same route (list by
folder) and a read-only browse screen (`/admin/media`) over this index —
uploads still happen from within each content editor, not from the
library screen itself.

## Schema files

All TypeScript/Zod validation lives in `src/lib/schemas/`:
`shared.ts` (status enum, slug pattern, SEO shape, common base fields),
`blocks.ts` (the 13 block types), `singletons.ts`, `collections.ts`.
Phase 4 wired `testimonialSchema`, `certificationSchema`, `redirectSchema`,
`caseStudySchema`, and `pageSingletonSchema` into real admin write paths
(`api/admin/collections/[type]/*`, `api/admin/pages/[slug]`) — every
other schema in these files (the 5 pre-existing bespoke editors' content
types, plus `siteSettingsSchema`/`navigationSchema`/`footerSchema`/
`profileSchema`/`legalPageSchema`) still isn't enforced end-to-end; those
editors validate ad-hoc in their own component code, not against these
Zod schemas.

Two schema bugs surfaced and fixed while wiring the first real writes
through them: `testimonialSchema.relatedServiceId` and
`caseStudySchema.testimonialId` were typed `.optional()` (undefined-only)
but their repositories map absent values to `null` — every re-save of an
existing row failed validation until both were changed to
`.nullable().optional()`.
