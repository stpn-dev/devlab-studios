# Current State

Snapshot as of 2026-08-14 after release `1.5.0` and repository branch cleanup.

## Product positioning

DevLab Studios presents Stephen Rey G. Agustinez as a **Full-Stack Software
Engineer & AI Automation Specialist**. Public messaging connects interfaces,
backend/API services, structured data, AI-assisted decisions, automation, and
human operational handoff as one system.

## Public experience

- Astro-rendered Home, About, Services, Work, Process, Insights, Profile,
  Contact, legal, maintenance, 404, article, and Work detail routes.
- A unified dark-native visual system with restrained technical vectors,
  reduced-motion support, responsive navigation, and decorative icon handling.
- Five deliberately distinct landing samples retain their portfolio styles.
- The canonical ATS resume remains unchanged and is available only from
  Profile at `/resume.pdf`, opening in a new tab without forced download.
- Static fallbacks keep public content available when a D1 record is absent.

## CMS and storage

- `/admin` manages Home, About, Process, Work, Projects, Services, Articles,
  Case Studies, Testimonials, Certifications, Profile, site settings, SEO,
  media metadata, redirects, leads, audit history, and content versions.
- Projects own reusable facts and media: title, description, technology,
  links, cover image, and ordered multi-image gallery.
- Work selects existing Projects and independently owns the Work description,
  Challenge, System Architecture, Delivery Value, ordering, and publication
  state. Its initial description is copied once from the Project and does not
  follow later Project description edits unless explicitly reset.
- A Project cannot be deleted while referenced by Work.
- R2 stores uploaded files. The `media_assets` D1 table powers the read-only
  `/admin/media` index; uploads remain within the owning editors.

## Deployment and branches

- `development` deploys to the isolated `devlab-studios-preview` Worker with
  Preview D1, R2, and secrets.
- `main` deploys the production `devlab-studios` Worker through Cloudflare
  Workers Builds.
- Both branches are kept synchronized; the current code baseline is release
  `1.5.0`.
- Stale merged feature branches and the clean profile-polish worktree were
  removed on 2026-08-14. See [branch-workflow.md](branch-workflow.md).

## Verification baseline

Release `1.5.0` passed:

- `npm run typecheck`
- `npm run build`
- the complete static Playwright project (`36/36`)
- focused Work CMS selection, independent narrative, gallery, persistence,
  restore, and deletion-guard coverage
- live preview and production route checks

## Environment status

- Preview code and Preview D1 contain the Work CMS integration and bootstrap.
- Production code is deployed and the public Work page safely uses its bundled
  fallback.
- **Pending operator action:** apply and verify the targeted, idempotent
  `scripts/cms/updates/2026-08-14-work-page-cms.sql` bootstrap against
  Production D1 using a fresh Cloudflare API token. Do not run the full seed.
- The guarded prerequisite update found the initial featured Projects already
  present and published in Production.

## Known limitations and follow-ups

- The in-memory first-line contact rate limiter is not durable across Worker
  instances; lead persistence remains D1-backed.
- The media library lists uploads recorded in `media_assets`; legacy R2 objects
  without metadata rows do not appear automatically.
- Media uploads are stored and served from R2, but automatic server-side
  conversion of every raw PNG/JPEG into multiple modern formats is not a
  universal upload guarantee. Preserve originals and verify important assets.
- Case Studies and Testimonials may legitimately be empty until records are
  published.
- Production D1 content must be inspected directly before assuming it matches
  seed files or Preview.
