# Content Model

Updated 2026-08-14 for release `1.5.0`. This document describes current D1
storage, validation, editor ownership, and public read behavior.

## Cross-cutting history and audit

- `content_versions` stores append-only snapshots for versioned content writes.
  Restoring an older value creates a new current version; history is not
  rewritten.
- `audit_log` records actor, action, entity type/id, metadata, and timestamp for
  supported create, update, publication, deletion, and restore operations.
- Generic page and collection routes use the shared version/audit path. Several
  older bespoke editors still use their established repositories and should be
  migrated deliberately rather than assumed to have identical coverage.

## Singleton content

| Content | Storage | Public/admin behavior |
|---|---|---|
| Home, About, Process, Work | `pages` + `page_sections` | Block-composed pages with static fallbacks and dedicated/admin page editors |
| Site settings | `site_settings` | Brand, availability, URLs, and global configuration |
| Navigation | `navigation_items` | Published items populate the public shell; static navigation protects unavailable CMS reads |
| Footer | `site_settings` key `site_footer` | Brand, Explore, Connect, legal, and contact content |
| Profile | `site_settings` key `profile_about` plus `experiences`, `skills`, `tools`, and `workflow_items` | Dedicated profile editor and public static fallback |
| Contact | Fixed form plus environment settings | Form behavior is application code; surrounding public copy is not an arbitrary form schema |
| Privacy and Terms | `pages`/`page_sections` or bundled fallback | Rich-text legal content without arbitrary executable markup |

## Approved page blocks

`src/lib/schemas/blocks.ts` defines fourteen Zod-validated block types:

- `hero`
- `richText`
- `stats`
- `processSteps`
- `experienceTimeline`
- `servicesGrid`
- `featuredProjects`
- `workProjectShowcase`
- `featuredCaseStudies`
- `testimonials`
- `faq`
- `resourceCards`
- `imageGallery`
- `cta`

Blocks accept structured props only. CMS users cannot inject arbitrary HTML,
JavaScript, CSS, or SVG. Decorative motifs use approved icon keys.

## Collections

| Collection | Storage | Notes |
|---|---|---|
| Projects | `projects` + `project_gallery_images` | Owns reusable facts, cover media, and ordered multi-image galleries; deletion is blocked while referenced by Work |
| Services | `service_groups` | Service category content and related project patterns |
| Articles | `articles` | Insight/article records served through `/insights` and article API routes |
| Resources | `resources` | Download, checklist, template, or external-link records; distinct from Articles |
| Experiences | `experiences` | Profile timeline entries |
| Certifications | `certifications` | Platform and professional certification metadata and image references |
| Case Studies | `case_studies` | Structured case-study records with optional Project/Testimonial references |
| Testimonials | `testimonials` | Structured proof records; may legitimately be empty |
| FAQs | `faqs` | Context/page-specific questions and answers |
| Redirects | `redirects` | Consulted by middleware only after a real 404; do not duplicate a D1 redirect with a hardcoded page redirect |
| Leads | `leads` + `delivery_attempts` | Contact persistence and Zoho delivery/retry history; operational rather than editorial content |

## Work and Project ownership

Work is a curated presentation of existing Projects, not a second upload path.
A `workProjectShowcase` item stores:

- `projectId`
- independent Work `description`
- `challenge`
- `architecture`
- `deliveryValue`
- ordering and publication state

Selecting a Project copies its description once as an initial editable value.
Later Project description changes do not overwrite Work wording unless an
editor explicitly resets it. Public rendering resolves the latest Project
title, stack, links, cover image, and ordered gallery while preserving Work's
independent narrative.

The Work API validates references and publication prerequisites. A published
Work item requires its referenced Project to exist and be published. Project
deletion returns a conflict while the Project is featured on Work.

## Articles and Resources

Migration `0004_content_model_v2.sql` renamed the original article-shaped
`resources` table to `articles` and created a new `resources` table for actual
download/reference material. Public article routes are `/insights` and
`/insights/[slug]`. Legacy `/resources` URLs redirect through the repository's
redirect behavior.

Some repository function names retain historical `Resources` wording while
querying `articles`; treat the D1 table and current Astro route names as the
public source of truth when extending this area.

## Media and R2

R2 stores uploaded bytes. `media_assets` stores the CMS metadata index:

- R2 key and public URL
- original filename and content type
- byte size
- alt text
- logical folder

`POST /api/admin/media` uploads the file and attempts to add its metadata row.
`GET /api/admin/media` lists indexed uploads for `/admin/media`. The media page
is read-only; upload and replacement happen inside owning editors. Existing R2
objects without a `media_assets` row do not appear automatically.

The upload path does not universally promise automatic conversion of every raw
PNG/JPEG to multiple modern formats. Preserve important originals and validate
quality/weight in the public rendering path.

## Validation sources

Shared Zod schemas live under `src/lib/schemas/`:

- `shared.ts` — statuses, slugs, SEO, and shared primitives
- `blocks.ts` — block-composed page types, including Work
- `singletons.ts` — singleton page/settings shapes
- `collections.ts` — collection record shapes

Admin field descriptors define safe editor controls and previews; Zod remains
the write-validation authority. When a content shape changes, update all four
manual surfaces together: D1 repository/write path, Admin form, public read and
render path, and static fallback.

## Seeds and live databases

Seed files bootstrap a fresh environment and are not a live database mirror.
Never run the destructive full seed against an existing Preview or Production
database. Inspect current rows, apply a targeted idempotent update, and verify
the destination afterward.
