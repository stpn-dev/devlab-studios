# Admin CMS — Media Library & Project Images Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project thumbnails a *selection* from a project's Gallery Images (not an independent upload), defer all image uploads until Save is clicked, genuinely delete superseded/removed images instead of orphaning them, and give the Media Library a Details/table view with "used by" visibility and an actionable delete-conflict dialog.

**Architecture:** A new `is_thumbnail` boolean column on `project_gallery_images` becomes the single source of truth for "which gallery image is the thumbnail" (`projects.image_url` is derived from it server-side on every save, so the public site's read path is untouched). The project editor stops uploading files on selection — it stages them client-side (blob preview + `File` object) and only uploads + saves on submit. Every place an image URL disappears from a project's submitted state (removed, replaced, or thumbnail cleared away from) is diffed server-side against what the project had before, and anything no longer referenced anywhere else is deleted from R2 + `media_assets` for real.

**Tech Stack:** Astro (API routes), React (admin UI), Cloudflare Workers/D1/R2, Zod (validation), Playwright (e2e), Vitest (new — unit tests for this feature's pure logic).

**Spec:** `docs/superpowers/specs/2026-08-16-admin-cms-media-project-images-design.md`

## Global Constraints

- No public-site changes required — `projects.image_url` remains the only column public pages read; only how it's written changes.
- Migration `0007_project_gallery_thumbnail.sql` must be applied (and its backfill run) before the new repository code is deployed, so no currently-published project's thumbnail disappears.
- Gallery item field casing stays camelCase end-to-end (`url`, `filename`, `altText`, `sortOrder`, new `isThumbnail`) — matches `projectGalleryImageSchema` and the repository's existing `normalizeGalleryImages`/`toGalleryImage`.
- No unit test runner exists in this repo today (Playwright e2e only) — this plan adds Vitest, but only for pure, DB-free logic (schema validation, gallery diffing/derivation helpers, the upload-staging helper). Anything that must touch D1/R2 is covered by the e2e suite or manual verification steps, matching this project's existing testing posture — do not invent a fake-D1 mocking framework.
- `ProjectsManager.jsx` (923 lines) and this feature's growth are why it's split into smaller files as part of this plan — follow the existing Tailwind class style and component conventions already in the file when writing new components.

---

### Task 1: Add Vitest as the unit test runner

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/lib/schemas/collections.smoke.test.js` (throwaway smoke test, deleted at the end of this task once Task 3 has a real test)

**Interfaces:**
- Produces: `npm run test:unit` script; any `*.test.js`/`*.test.ts` file under `src/` is picked up automatically.

- [ ] **Step 1: Install Vitest**

Run: `npm install --save-dev vitest`

- [ ] **Step 2: Create the Vitest config**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add the `test:unit` script to `package.json`**

Add this line inside the existing `"scripts"` object (alongside `"test:e2e": "playwright test"`):

```json
"test:unit": "vitest run",
```

- [ ] **Step 4: Write a throwaway smoke test to confirm the runner works**

```js
// src/lib/schemas/collections.smoke.test.js
import { describe, it, expect } from 'vitest'

describe('vitest smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `npm run test:unit`
Expected: PASS (1 test)

- [ ] **Step 6: Delete the smoke test file**

Delete `src/lib/schemas/collections.smoke.test.js` — Task 3 adds the first real test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore: add vitest as the unit test runner"
```

---

### Task 2: Migration — `is_thumbnail` column + backfill

**Files:**
- Create: `migrations/0007_project_gallery_thumbnail.sql`

**Interfaces:**
- Produces: `project_gallery_images.is_thumbnail` (INTEGER, 0/1, default 0) — every later task's SQL and repository code depends on this column existing.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/0007_project_gallery_thumbnail.sql

ALTER TABLE project_gallery_images ADD COLUMN is_thumbnail INTEGER NOT NULL DEFAULT 0;

-- Flag the existing gallery row that already matches the project's current thumbnail URL
-- (picks the earliest-sorted match if duplicates exist, so exactly one row gets flagged).
UPDATE project_gallery_images
SET is_thumbnail = 1
WHERE id IN (
  SELECT pgi.id
  FROM project_gallery_images pgi
  JOIN projects ON projects.id = pgi.project_id
  WHERE projects.image_url IS NOT NULL
    AND projects.image_url != ''
    AND pgi.url = projects.image_url
    AND pgi.id = (
      SELECT pgi2.id FROM project_gallery_images pgi2
      WHERE pgi2.project_id = pgi.project_id AND pgi2.url = projects.image_url
      ORDER BY pgi2.sort_order ASC, pgi2.created_at ASC
      LIMIT 1
    )
);

-- For any project whose thumbnail URL has no matching gallery row at all, clone it in as one
-- (sort_order -1 so it sorts first), so no published project loses its visible thumbnail.
INSERT INTO project_gallery_images (id, project_id, url, filename, alt_text, sort_order, is_thumbnail, created_at, updated_at)
SELECT lower(hex(randomblob(16))),
       projects.id,
       projects.image_url,
       projects.image_filename,
       '',
       -1,
       1,
       projects.updated_at,
       projects.updated_at
FROM projects
WHERE projects.image_url IS NOT NULL
  AND projects.image_url != ''
  AND NOT EXISTS (
    SELECT 1 FROM project_gallery_images
    WHERE project_gallery_images.project_id = projects.id
      AND project_gallery_images.url = projects.image_url
  );
```

- [ ] **Step 2: Apply it to the local D1 database**

Run: `npx wrangler d1 migrations apply devlab-studios-cms --local`
Expected: output lists `0007_project_gallery_thumbnail.sql` as applied.

- [ ] **Step 3: Manually verify the backfill**

Run: `npx wrangler d1 execute devlab-studios-cms --local --command "SELECT p.id, p.image_url, g.url, g.is_thumbnail FROM projects p LEFT JOIN project_gallery_images g ON g.project_id = p.id AND g.is_thumbnail = 1 WHERE p.image_url IS NOT NULL AND p.image_url != ''"`
Expected: every row with a non-empty `image_url` has a matching gallery row with `is_thumbnail = 1` and the same URL. If any row shows a NULL gallery `url`, the backfill missed it — investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add migrations/0007_project_gallery_thumbnail.sql
git commit -m "feat: add is_thumbnail column to project_gallery_images with backfill"
```

---

### Task 3: Zod schema — `isThumbnail` field + at-most-one validation

**Files:**
- Modify: `src/lib/schemas/collections.ts`
- Test: `src/lib/schemas/collections.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `projectRequestSchema` now accepts/validates `galleryImages[].isThumbnail: boolean`, and rejects (via Zod issue) any payload with more than one `isThumbnail: true` entry. Later tasks (repository, UI) rely on this field name and rule already being enforced at the API boundary.

- [ ] **Step 1: Read the current schema file to confirm exact surrounding code**

Read `src/lib/schemas/collections.ts` lines 1-50 before editing (the exact `projectGalleryImageSchema` and `projectRequestSchema` definitions reported during research: lines 25-31 and 43-46) — line numbers may have shifted slightly since research; match on the schema names, not line numbers.

- [ ] **Step 2: Write the failing test**

```js
// src/lib/schemas/collections.test.js
import { describe, it, expect } from 'vitest'
import { projectRequestSchema } from './collections'

const basePayload = {
  id: 'demo-project',
  title: 'Demo Project',
  description: 'A demo project.',
  type: 'Automation',
}

describe('projectRequestSchema — gallery thumbnail flag', () => {
  it('defaults isThumbnail to false when omitted', () => {
    const result = projectRequestSchema.safeParse({
      ...basePayload,
      galleryImages: [{ url: 'https://example.com/a.webp' }],
    })
    expect(result.success).toBe(true)
    expect(result.data.galleryImages[0].isThumbnail).toBe(false)
  })

  it('accepts exactly one isThumbnail: true', () => {
    const result = projectRequestSchema.safeParse({
      ...basePayload,
      galleryImages: [
        { url: 'https://example.com/a.webp', isThumbnail: true },
        { url: 'https://example.com/b.webp', isThumbnail: false },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects more than one isThumbnail: true', () => {
    const result = projectRequestSchema.safeParse({
      ...basePayload,
      galleryImages: [
        { url: 'https://example.com/a.webp', isThumbnail: true },
        { url: 'https://example.com/b.webp', isThumbnail: true },
      ],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:unit -- collections.test.js`
Expected: FAIL — `isThumbnail` is `undefined` (or Zod strips the unknown key), and the "rejects more than one" case doesn't fail parsing yet.

- [ ] **Step 4: Update the schema**

In `src/lib/schemas/collections.ts`, add `isThumbnail` to `projectGalleryImageSchema`:

```ts
const projectGalleryImageSchema = z.object({
  id: z.string().optional(),
  url: z.string().optional().default(''),
  filename: z.string().optional().default(''),
  altText: z.string().optional().default(''),
  sortOrder: z.union([z.number(), z.string()]).optional(),
  isThumbnail: z.boolean().optional().default(false),
})
```

Then change `projectRequestSchema` to add the at-most-one refinement:

```ts
export const projectRequestSchema = projectSchema
  .extend({
    imageFilename: z.string().optional().default(''),
    galleryImages: z.array(projectGalleryImageSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const thumbnailCount = data.galleryImages.filter((image) => image.isThumbnail).length
    if (thumbnailCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['galleryImages'],
        message: 'Only one gallery image may be marked as the thumbnail.',
      })
    }
  })
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- collections.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/collections.ts src/lib/schemas/collections.test.js
git commit -m "feat: validate gallery isThumbnail flag in projectRequestSchema"
```

---

### Task 4: `mediaAssets.js` — consolidated Project reference query + `deleteMediaAssetByUrl`

**Files:**
- Modify: `src/worker/repositories/mediaAssets.js`

**Interfaces:**
- Consumes: nothing new (still just `db`, and now `mediaBucket` for the new function).
- Produces: `findMediaReferences` now returns a single `{ type: 'Project', id, label, isThumbnail }` entry per project usage (instead of separate `Project cover`/`Project gallery` types) — Task 5 and Task 14 rely on the `isThumbnail` field. New export `deleteMediaAssetByUrl(db, mediaBucket, url): Promise<boolean>` — Task 5 relies on this exact signature and return type.

- [ ] **Step 1: Replace the two Project reference queries with one joined query**

In `src/worker/repositories/mediaAssets.js`, in `MEDIA_REFERENCE_QUERIES`, replace these two lines:

```js
{ type: 'Project cover', sql: 'SELECT id, title AS label FROM projects WHERE image_url = ?' },
{ type: 'Project gallery', sql: 'SELECT project_id AS id, alt_text AS label FROM project_gallery_images WHERE url = ?' },
```

with one:

```js
{
  type: 'Project',
  sql: `SELECT project_gallery_images.project_id AS id,
               projects.title AS label,
               project_gallery_images.is_thumbnail AS isThumbnail
        FROM project_gallery_images
        JOIN projects ON projects.id = project_gallery_images.project_id
        WHERE project_gallery_images.url = ?`,
},
```

Since `is_thumbnail` is stored as `0`/`1` in SQLite, update the mapping loop just below (inside `findMediaReferences`) so the boolean survives:

```js
for (const row of result.results || []) {
  references.push({ type: query.type, id: row.id, label: row.label || row.id, isThumbnail: Boolean(row.isThumbnail) })
}
```

- [ ] **Step 2: Add `deleteMediaAssetByUrl`**

Add this new exported function right after `deleteMediaAsset`:

```js
export async function deleteMediaAssetByUrl(db, mediaBucket, url) {
  const row = await db.prepare('SELECT key FROM media_assets WHERE url = ?').bind(url).first()
  if (!row?.key) return false
  await mediaBucket.delete(row.key)
  await deleteMediaAsset(db, row.key)
  return true
}
```

(If there's no `media_assets` row for that URL — e.g. it was never tracked — this safely no-ops rather than guessing at an R2 key.)

- [ ] **Step 3: Manually verify against the local D1/R2 dev environment**

Run the dev server (`npm run dev`), open `/admin/media`, and delete an image that's a project's thumbnail — confirm the 409 response body now has one `Project` entry (not two) with `isThumbnail: true`, via the Network tab.

- [ ] **Step 4: Commit**

```bash
git add src/worker/repositories/mediaAssets.js
git commit -m "feat: consolidate project media references and add deleteMediaAssetByUrl"
```

---

### Task 5: `projects.js` — thumbnail derivation + orphan cleanup on save

**Files:**
- Modify: `src/worker/repositories/projects.js`
- Test: `src/worker/repositories/projects.test.js`

**Interfaces:**
- Consumes: `findMediaReferences`, `deleteMediaAssetByUrl` from `./mediaAssets.js` (Task 4).
- Produces: `normalizeGalleryImages` (now exported) returns items with an `isThumbnail: boolean` field. New exported pure helpers `deriveThumbnailFields(normalizedImages): { imageUrl: string, imageFilename: string }` and `diffRemovedGalleryUrls(previousUrls: string[], nextUrls: string[]): string[]` — unit tested directly. `upsertProject(db, input, env = {})` gains a third parameter; `env.MEDIA_BUCKET` is used for cleanup (safely skipped if absent, e.g. in tests). `toGalleryImage` now includes `isThumbnail` in its return shape.

- [ ] **Step 1: Write the failing unit tests for the new pure helpers**

```js
// src/worker/repositories/projects.test.js
import { describe, it, expect } from 'vitest'
import { normalizeGalleryImages, deriveThumbnailFields, diffRemovedGalleryUrls } from './projects.js'

describe('normalizeGalleryImages', () => {
  it('maps isThumbnail from input, defaulting to false', () => {
    const result = normalizeGalleryImages([
      { url: 'https://example.com/a.webp', isThumbnail: true },
      { url: 'https://example.com/b.webp' },
    ])
    expect(result[0].isThumbnail).toBe(true)
    expect(result[1].isThumbnail).toBe(false)
  })

  it('drops items with no url', () => {
    const result = normalizeGalleryImages([{ url: '' }, { url: 'https://example.com/a.webp' }])
    expect(result).toHaveLength(1)
  })
})

describe('deriveThumbnailFields', () => {
  it('returns the flagged row url/filename', () => {
    const result = deriveThumbnailFields([
      { url: 'https://example.com/a.webp', filename: 'a.webp', isThumbnail: false },
      { url: 'https://example.com/b.webp', filename: 'b.webp', isThumbnail: true },
    ])
    expect(result).toEqual({ imageUrl: 'https://example.com/b.webp', imageFilename: 'b.webp' })
  })

  it('returns empty strings when nothing is flagged', () => {
    const result = deriveThumbnailFields([{ url: 'https://example.com/a.webp', filename: 'a.webp', isThumbnail: false }])
    expect(result).toEqual({ imageUrl: '', imageFilename: '' })
  })

  it('returns empty strings for an empty gallery', () => {
    expect(deriveThumbnailFields([])).toEqual({ imageUrl: '', imageFilename: '' })
  })
})

describe('diffRemovedGalleryUrls', () => {
  it('returns urls present before but not after', () => {
    const result = diffRemovedGalleryUrls(
      ['https://example.com/a.webp', 'https://example.com/b.webp'],
      ['https://example.com/b.webp'],
    )
    expect(result).toEqual(['https://example.com/a.webp'])
  })

  it('returns an empty array when nothing was removed', () => {
    const result = diffRemovedGalleryUrls(['https://example.com/a.webp'], ['https://example.com/a.webp'])
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- projects.test.js`
Expected: FAIL — `deriveThumbnailFields`/`diffRemovedGalleryUrls` are not exported yet, `isThumbnail` isn't mapped.

- [ ] **Step 3: Update `normalizeGalleryImages` and export it**

```js
export function normalizeGalleryImages(input) {
  if (!Array.isArray(input)) return []

  return input
    .map((item, index) => ({
      id: String(item?.id || crypto.randomUUID()).trim(),
      url: String(item?.url || '').trim(),
      filename: String(item?.filename || '').trim(),
      altText: String(item?.altText || '').trim(),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index + 1,
      isThumbnail: Boolean(item?.isThumbnail),
    }))
    .filter((item) => item.url)
}
```

- [ ] **Step 4: Add `deriveThumbnailFields` and `diffRemovedGalleryUrls`**

Add these two new exported functions near `normalizeGalleryImages`:

```js
export function deriveThumbnailFields(normalizedImages) {
  const thumbnail = normalizedImages.find((image) => image.isThumbnail)
  return {
    imageUrl: thumbnail?.url || '',
    imageFilename: thumbnail?.filename || '',
  }
}

export function diffRemovedGalleryUrls(previousUrls, nextUrls) {
  const nextSet = new Set(nextUrls)
  return previousUrls.filter((url) => !nextSet.has(url))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- projects.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: Update `toGalleryImage` to include `isThumbnail`**

```js
function toGalleryImage(row) {
  return {
    id: row.id,
    url: row.url,
    filename: row.filename || '',
    altText: row.alt_text || '',
    sortOrder: Number(row.sort_order) || 0,
    isThumbnail: Boolean(row.is_thumbnail),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

- [ ] **Step 7: Add `is_thumbnail` to the two `SELECT` statements that read gallery rows**

In `listGalleryImagesForProjects` (the query inside it), change:

```sql
SELECT id, project_id, url, filename, alt_text, sort_order, created_at, updated_at
```
to:
```sql
SELECT id, project_id, url, filename, alt_text, sort_order, is_thumbnail, created_at, updated_at
```

- [ ] **Step 8: Update `syncProjectGallery` to accept pre-normalized images and persist `is_thumbnail`**

Replace the whole function (it stops calling `normalizeGalleryImages` itself — the caller now does that once and reuses the result):

```js
async function syncProjectGallery(db, projectId, normalizedImages) {
  try {
    const timestamp = nowIso()
    const statements = [db.prepare('DELETE FROM project_gallery_images WHERE project_id = ?').bind(projectId)]

    for (const image of normalizedImages) {
      statements.push(
        db
          .prepare(
            `INSERT INTO project_gallery_images (
              id, project_id, url, filename, alt_text, sort_order, is_thumbnail, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            image.id,
            projectId,
            image.url,
            image.filename,
            image.altText,
            image.sortOrder,
            image.isThumbnail ? 1 : 0,
            timestamp,
            timestamp,
          ),
      )
    }

    await db.batch(statements)
  } catch (error) {
    if (isMissingGalleryTableError(error) && normalizedImages.length === 0) return
    if (isMissingGalleryTableError(error)) {
      const migrationError = new Error('Project gallery migration is missing. Apply migrations/0002_project_gallery_images.sql first.')
      migrationError.status = 503
      throw migrationError
    }
    throw error
  }
}
```

- [ ] **Step 9: Add the orphan-cleanup helper**

Add this near the top of the file, importing from `./mediaAssets.js`:

```js
import { deleteMediaAssetByUrl, findMediaReferences } from './mediaAssets.js'
```

```js
async function cleanupOrphanedGalleryImages(db, env, removedUrls) {
  const mediaBucket = env?.MEDIA_BUCKET
  if (!mediaBucket || !removedUrls.length) return

  for (const url of removedUrls) {
    const stillReferenced = await findMediaReferences(db, [url])
    if (stillReferenced.length) continue
    await deleteMediaAssetByUrl(db, mediaBucket, url)
  }
}
```

- [ ] **Step 10: Rewrite `upsertProject` to derive the thumbnail fields and run cleanup**

```js
export async function upsertProject(db, input, env = {}) {
  const before = input.id ? await getProject(db, input.id, { includeDrafts: true }) : null
  const previousGalleryUrls = before ? before.galleryImages.map((image) => image.url) : []

  const normalizedImages = normalizeGalleryImages(input.galleryImages)
  const { imageUrl, imageFilename } = deriveThumbnailFields(normalizedImages)

  const project = toDbProject({ ...input, imageUrl, imageFilename })
  const timestamp = nowIso()

  if (!project.id || !project.title || !project.description || !project.type) {
    const error = new Error('Project id, title, description, and type are required.')
    error.status = 400
    throw error
  }

  await db
    .prepare(
      `INSERT INTO projects (
        id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        tech_stack = excluded.tech_stack,
        live_url = excluded.live_url,
        source_url = excluded.source_url,
        image_url = excluded.image_url,
        image_filename = excluded.image_filename,
        type = excluded.type,
        sort_order = excluded.sort_order,
        status = excluded.status,
        updated_at = excluded.updated_at`,
    )
    .bind(
      project.id,
      project.title,
      project.description,
      project.tech_stack,
      project.live_url,
      project.source_url,
      project.image_url,
      project.image_filename,
      project.type,
      project.sort_order,
      project.status,
      timestamp,
      timestamp,
    )
    .run()

  await syncProjectGallery(db, project.id, normalizedImages)

  const nextGalleryUrls = normalizedImages.map((image) => image.url)
  const removedUrls = diffRemovedGalleryUrls(previousGalleryUrls, nextGalleryUrls)
  await cleanupOrphanedGalleryImages(db, env, removedUrls)

  return getProject(db, project.id, { includeDrafts: true })
}
```

- [ ] **Step 11: Run the full unit test file once more**

Run: `npm run test:unit -- projects.test.js`
Expected: PASS (7 tests) — this step only re-confirms nothing in steps 6-10 broke the pure-helper tests (those functions are unchanged by steps 6-10).

- [ ] **Step 12: Manually verify end-to-end against the local dev environment**

With the dev server running, open a project in `/admin/content/projects`, add two gallery images, mark one as thumbnail (this control doesn't exist yet — for this manual check, `PUT` the project directly via `curl`/Thunder Client with a `galleryImages` array containing `isThumbnail: true` on one item), save, then `GET /api/admin/projects/{id}` and confirm `imageUrl` matches the flagged row's `url`. Then submit again with that row removed from `galleryImages` and confirm (via `/admin/media`) the corresponding R2 object and `media_assets` row are gone.

- [ ] **Step 13: Commit**

```bash
git add src/worker/repositories/projects.js src/worker/repositories/projects.test.js
git commit -m "feat: derive project thumbnail from gallery is_thumbnail flag, clean up removed images"
```

---

### Task 6: Wire `env` into the project save routes

**Files:**
- Modify: `src/pages/api/admin/projects/index.ts`
- Modify: `src/pages/api/admin/projects/[id].ts`

**Interfaces:**
- Consumes: `upsertProject(db, input, env)` (Task 5's new signature).
- Produces: nothing new for later tasks — this just threads `env` through so Task 5's cleanup logic actually runs in production.

- [ ] **Step 1: Update the POST handler**

In `src/pages/api/admin/projects/index.ts`, change:
```ts
const project = await upsertProject(env.DB, result.data) as { id?: string; status?: string } | null
```
to:
```ts
const project = await upsertProject(env.DB, result.data, env) as { id?: string; status?: string } | null
```

- [ ] **Step 2: Update the PUT and PATCH handlers**

In `src/pages/api/admin/projects/[id].ts`, change both occurrences:
```ts
const project = await upsertProject(env.DB, result.data) as { id?: string; status?: string; title?: string } | null
```
to:
```ts
const project = await upsertProject(env.DB, result.data, env) as { id?: string; status?: string; title?: string } | null
```
(This appears once in `PUT` and once in `PATCH` — update both.)

- [ ] **Step 3: Manually verify**

Run the dev server, save a project through the existing UI (before Task 12's rewire, the current UI still works — it just won't set `isThumbnail` yet), and confirm the save still succeeds with no errors in the terminal running `astro dev`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/projects/index.ts src/pages/api/admin/projects/[id].ts
git commit -m "fix: pass env through to upsertProject so orphaned gallery images are cleaned up"
```

---

### Task 7: Media list — attach `usedBy` per asset

**Files:**
- Modify: `src/pages/api/admin/media.ts`

**Interfaces:**
- Consumes: `findMediaReferences` (Task 4's consolidated version).
- Produces: each object returned by `GET /api/admin/media` now includes `usedBy: Array<{ type: string, id: string, label: string, isThumbnail?: boolean }>` — Task 13 (Details/grid views) renders this field.

- [ ] **Step 1: Read the current GET handler**

Read `src/pages/api/admin/media.ts` lines 78-127. The handler lists R2 objects, left-joins `media_assets` by `key` via a `Map`, and builds `const assets = listed.objects.map((object) => ({ id, key, url, filename, contentType, size, altText, folder, uploadedAt, etag, trackedInD1 }))`, then returns `jsonResponse({ assets, summary, cursor })` — note the response is an object with an `assets` array property, not a bare array. `uploadedAt` is the only timestamp field present (no `createdAt`).

- [ ] **Step 2: Import `findMediaReferences`**

It's likely already imported for the PATCH/DELETE handlers — confirm the import line includes it:
```ts
import { deleteMediaAsset, findMediaReferences, listMediaAssets, recordMediaAsset, replaceMediaReferences } from '../../../worker/repositories/mediaAssets.js'
```

- [ ] **Step 3: Attach `usedBy` to each asset before returning**

Change the `assets` construction from a plain `.map()` to an `await Promise.all(...)` that also fetches references per asset (the function already dedupes by `type`+`id`, so calling it once per asset is a correct, if not maximally batched, approach for a media library sized for a portfolio site):

```ts
const assets = await Promise.all(listed.objects.map(async (object) => {
  const tracked = trackedByKey.get(object.key)
  const contentType = String(object.httpMetadata?.contentType || tracked?.contentType || inferContentType(object.key))
  const folder = object.key.includes('/') ? object.key.slice(0, object.key.lastIndexOf('/')) : 'root'
  const url = publicBaseUrl ? `${publicBaseUrl}/${object.key.split('/').map(encodeURIComponent).join('/')}` : tracked?.url || ''
  const usedBy = env.DB ? await findMediaReferences(env.DB, [object.key, url]) : []
  return {
    id: tracked?.id || object.key,
    key: object.key,
    url,
    filename: tracked?.filename || filenameFromKey(object.key),
    contentType,
    size: object.size,
    altText: tracked?.altText || '',
    folder,
    uploadedAt: object.uploaded.toISOString(),
    etag: object.httpEtag,
    trackedInD1: Boolean(tracked),
    usedBy,
  }
}))
```

The rest of the handler (the `return jsonResponse({ assets, summary, cursor })` block and the `summary` calculations) stays exactly as it is — `summary` is computed from `assets` after this change the same way it was before.

- [ ] **Step 4: Manually verify**

Run the dev server, open Network tab, hit `/admin/media`, call `GET /api/admin/media` and confirm each object in the response's `assets` array now has a `usedBy` array (empty for unreferenced assets, populated for a project's thumbnail/gallery image).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/media.ts
git commit -m "feat: include usedBy references in the media list response"
```

---

### Task 8: Logo fallback for projects with no thumbnail

**Files:**
- Modify: `src/components/ResponsivePicture.jsx`
- Modify: `src/components/PortfolioCard.jsx`

**Interfaces:**
- Consumes: `brandingAssets.logoOnlyUrl` (`src/config/branding.js`), local asset `../assets/devlabstudios-logo-only.png` — same pattern already used in `src/components/Navbar.astro`.
- Produces: `ResponsivePicture` renders a logo fallback instead of `null` when `image` is falsy; no new exports for other tasks to consume.

- [ ] **Step 1: Read the current `ResponsivePicture.jsx` and `PortfolioCard.jsx` in full**

Both are short (30 and 34 lines per the research report) — read them fully before editing so the fallback branch matches existing prop names exactly.

- [ ] **Step 2: Add a logo fallback prop to `ResponsivePicture`**

In `src/components/ResponsivePicture.jsx`, add the import at the top:
```jsx
import { brandingAssets } from '../config/branding.js'
import devlabStudiosLogo from '../assets/devlabstudios-logo-only.png'
```

Change the early-return branch (currently `if (!image) return null`) to render a logo fallback instead:
```jsx
if (!image) {
  return (
    <img
      src={brandingAssets.logoOnlyUrl}
      data-fallback-src={devlabStudiosLogo.src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(event) => {
        const target = event.currentTarget
        if (target.dataset.fallbackSrc && target.src !== target.dataset.fallbackSrc) {
          target.src = target.dataset.fallbackSrc
        }
      }}
    />
  )
}
```
Keep every other prop (`alt`, `className`) exactly as `PortfolioCard.jsx` already passes them — no prop signature change needed there.

- [ ] **Step 3: Confirm `PortfolioCard.jsx` needs no changes**

Since `ResponsivePicture` now handles the fallback internally, `PortfolioCard.jsx`'s existing call (`<ResponsivePicture image={project.optimizedImage} alt={...} className={...} />`) already works unchanged — no edit needed here, just verify by reading it again after Step 2.

- [ ] **Step 4: Manually verify in the browser**

Run `npm run dev`, temporarily view a project with no `imageUrl`/gallery thumbnail on the public `/work` or portfolio section, and confirm the logo renders in the card instead of a blank space. Revert any temporary data changes used for this check.

- [ ] **Step 5: Commit**

```bash
git add src/components/ResponsivePicture.jsx
git commit -m "feat: fall back to the company logo when a project has no thumbnail"
```

---

### Task 9: `projectImageUpload.js` — deferred-upload helper

**Files:**
- Create: `src/components/admin/projects/projectImageUpload.js`
- Test: `src/components/admin/projects/projectImageUpload.test.js`

**Interfaces:**
- Consumes: nothing (calls global `fetch` directly, mocked in the test).
- Produces: `uploadPendingGalleryImages(galleryImages, onProgress?): Promise<Array<GalleryImageFormItem>>` — Task 12 calls this from `saveProject`. Input/output item shape: `{ id, url, filename, altText, sortOrder, isThumbnail, pending, file }` (matches the form-state shape Task 12 defines); pending items get `file` uploaded and are returned with `pending: false, file: null, url: <real R2 url>, filename: <server filename>`; non-pending items pass through unchanged.

- [ ] **Step 1: Write the failing test**

```js
// src/components/admin/projects/projectImageUpload.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadPendingGalleryImages } from './projectImageUpload.js'

function makeFile(name) {
  return new File(['fake-bytes'], name, { type: 'image/webp' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadPendingGalleryImages', () => {
  it('passes through already-saved (non-pending) items unchanged', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: '1', url: 'https://example.com/a.webp', filename: 'a.webp', altText: '', sortOrder: 1, isThumbnail: false, pending: false, file: null }]
    const result = await uploadPendingGalleryImages(items)

    expect(result).toEqual(items)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads pending items and replaces url/filename with the server response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://example.com/real.webp', filename: 'real.webp' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: 'pending-1', url: 'blob:local-preview', filename: 'staged.webp', altText: 'Alt', sortOrder: 1, isThumbnail: true, pending: true, file: makeFile('staged.webp') }]
    const result = await uploadPendingGalleryImages(items)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/media', expect.objectContaining({ method: 'POST' }))
    expect(result).toEqual([{ id: 'pending-1', url: 'https://example.com/real.webp', filename: 'real.webp', altText: 'Alt', sortOrder: 1, isThumbnail: true, pending: false, file: null }])
  })

  it('throws with the file name when an upload fails, without uploading later items', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Too large' }) })
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: 'pending-1', url: 'blob:local-preview', filename: 'staged.webp', altText: '', sortOrder: 1, isThumbnail: false, pending: true, file: makeFile('staged.webp') }]

    await expect(uploadPendingGalleryImages(items)).rejects.toThrow('staged.webp')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports progress via the onProgress callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://example.com/real.webp', filename: 'real.webp' }) })
    vi.stubGlobal('fetch', fetchMock)
    const onProgress = vi.fn()

    const items = [{ id: 'pending-1', url: 'blob:local-preview', filename: 'staged.webp', altText: '', sortOrder: 1, isThumbnail: false, pending: true, file: makeFile('staged.webp') }]
    await uploadPendingGalleryImages(items, onProgress)

    expect(onProgress).toHaveBeenCalledWith('staged.webp')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- projectImageUpload.test.js`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement the helper**

```js
// src/components/admin/projects/projectImageUpload.js

/**
 * Uploads every "pending" (not-yet-persisted) gallery item to R2 via the
 * existing media upload endpoint, returning a new array where pending items
 * are replaced with their real url/filename. Non-pending items pass through
 * unchanged. Throws on the first failed upload — callers should treat that
 * as "nothing was saved" (the caller submits the project payload only after
 * this resolves).
 */
export async function uploadPendingGalleryImages(galleryImages, onProgress) {
  const items = Array.isArray(galleryImages) ? galleryImages : []
  const uploaded = []

  for (const item of items) {
    if (!item.pending || !item.file) {
      uploaded.push(item)
      continue
    }

    onProgress?.(item.file.name)

    const formData = new FormData()
    formData.append('folder', 'projects')
    formData.append('file', item.file)

    const response = await fetch('/api/admin/media', { method: 'POST', body: formData })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error ? `${item.file.name}: ${data.error}` : `Upload failed for ${item.file.name} (${response.status}).`)
    }

    uploaded.push({ ...item, url: data.url, filename: data.filename, pending: false, file: null })
  }

  return uploaded
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- projectImageUpload.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/projects/projectImageUpload.js src/components/admin/projects/projectImageUpload.test.js
git commit -m "feat: add deferred gallery image upload helper"
```

---

### Task 10: `GalleryImageRow.jsx` component

**Files:**
- Create: `src/components/admin/projects/GalleryImageRow.jsx`

**Interfaces:**
- Consumes: nothing new — pure presentational component.
- Produces: `<GalleryImageRow item, index, total, onUpdateAltText(index, value), onReplace(index, file), onRemove(index), onMove(index, direction) />` — Task 12 renders one per gallery item.

- [ ] **Step 1: Create the component**

This is the existing gallery row JSX (`ProjectsManager.jsx` lines ~776-834) extracted into its own file, plus: a Pending badge, a Replace file input, and disabling Remove when `item.isThumbnail` is true.

```jsx
// src/components/admin/projects/GalleryImageRow.jsx
import { ChevronLeft, ChevronRight, RotateCw, Trash2 } from '../../icons/icons'

function deriveFilenameFromUrl(url) {
  const value = String(url || '').trim()
  if (!value) return ''

  try {
    const normalized = new URL(value)
    return normalized.pathname.split('/').filter(Boolean).pop() || ''
  } catch {
    return value.split('/').filter(Boolean).pop() || ''
  }
}

export default function GalleryImageRow({ item, index, total, onUpdateAltText, onReplace, onRemove, onMove }) {
  return (
    <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          <img
            src={item.url}
            alt={item.altText || `Gallery image ${index + 1}`}
            className="h-24 w-full object-cover"
          />
          {item.pending ? (
            <span className="absolute left-1 top-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Pending
            </span>
          ) : null}
          {item.isThumbnail ? (
            <span className="absolute right-1 top-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Thumbnail
            </span>
          ) : null}
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Alt Text
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-slate-500"
              value={item.altText}
              onChange={(event) => onUpdateAltText(index, event.target.value)}
              placeholder="Project screenshot detail"
            />
          </label>
          <p className="truncate text-xs text-slate-500">{item.filename || deriveFilenameFromUrl(item.url)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Slide {index + 1}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={14} />
            Up
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Down
            <ChevronRight size={14} />
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
            <RotateCw size={14} />
            Replace
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onReplace(index, file)
                event.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={item.isThumbnail}
            title={item.isThumbnail ? 'Choose a different thumbnail before removing this image.' : undefined}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-50"
          >
            <Trash2 size={14} />
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/projects/GalleryImageRow.jsx
git commit -m "feat: extract GalleryImageRow component with replace/pending/thumbnail states"
```

---

### Task 11: `ThumbnailPicker.jsx` component

**Files:**
- Create: `src/components/admin/projects/ThumbnailPicker.jsx`

**Interfaces:**
- Consumes: `brandingAssets.logoOnlyUrl` (`src/config/branding.js`).
- Produces: `<ThumbnailPicker galleryImages, onSelect(id), onClear() />` — Task 12 mounts this in the editor sidebar in place of the removed upload control.

- [ ] **Step 1: Create the component**

```jsx
// src/components/admin/projects/ThumbnailPicker.jsx
import { Check, ImageOff } from '../../icons/icons'
import { brandingAssets } from '../../../config/branding.js'

export default function ThumbnailPicker({ galleryImages, onSelect, onClear }) {
  const hasImages = Array.isArray(galleryImages) && galleryImages.length > 0
  const selected = hasImages ? galleryImages.find((image) => image.isThumbnail) : null

  if (!hasImages) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
        <ImageOff size={20} className="text-slate-400" />
        Add gallery images first — no thumbnail selection possible yet.
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-2">
        {galleryImages.map((image) => (
          <button
            key={image.id}
            type="button"
            onClick={() => onSelect(image.id)}
            className={`relative overflow-hidden rounded-md border-2 transition ${
              image.isThumbnail ? 'border-slate-900' : 'border-transparent hover:border-slate-300'
            }`}
          >
            <img src={image.url} alt="" className="h-16 w-full object-cover" />
            {image.isThumbnail ? (
              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                <Check size={18} className="text-white" />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={!selected}
        className="justify-self-start text-xs font-semibold text-slate-500 underline decoration-dotted hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Clear thumbnail (show logo instead)
      </button>
      {!selected ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <img src={brandingAssets.logoOnlyUrl} alt="" className="h-4 w-4" />
          No thumbnail selected — the logo will show on the public site.
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Confirm `Check` and `ImageOff` exist in the shared icon module**

Read `src/components/icons/icons.js` (or `.jsx`) — if either name isn't exported there, use whatever equivalent check-mark/no-image icon names that file already exports instead (the file is the single source of truth for icon names in this codebase; do not add a new icon library).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/projects/ThumbnailPicker.jsx
git commit -m "feat: add ThumbnailPicker component for selecting a project's gallery-based thumbnail"
```

---

### Task 12: Rewire `ProjectsManager.jsx`

**Files:**
- Modify: `src/components/admin/ProjectsManager.jsx`

**Interfaces:**
- Consumes: `uploadPendingGalleryImages` (Task 9), `<GalleryImageRow>` (Task 10), `<ThumbnailPicker>` (Task 11), `useSearchParams`/`useNavigate` from `react-router-dom`.
- Produces: nothing new for later tasks other than the `?projectId=` query-param support Task 14 relies on.

- [ ] **Step 1: Update imports**

Remove the now-unused `Image` icon import if nothing else in the file uses it after this task's edits (check remaining usages first). Add:
```jsx
import { useSearchParams } from 'react-router-dom'
import GalleryImageRow from './projects/GalleryImageRow'
import ThumbnailPicker from './projects/ThumbnailPicker'
import { uploadPendingGalleryImages } from './projects/projectImageUpload'
```

- [ ] **Step 2: Update `toFormProject` to carry `isThumbnail`/`pending`/`file` per gallery item**

```js
function toFormProject(project) {
  return {
    ...emptyProject,
    ...project,
    galleryImages: Array.isArray(project.galleryImages)
      ? project.galleryImages
          .filter((item) => item?.url)
          .map((item, index) => ({
            id: item.id || `${project.id || 'project'}-gallery-${index + 1}`,
            url: item.url,
            filename: item.filename || deriveFilenameFromUrl(item.url),
            altText: item.altText || '',
            sortOrder: Number(item.sortOrder) || index + 1,
            isThumbnail: Boolean(item.isThumbnail),
            pending: false,
            file: null,
          }))
      : [],
    techStackText: Array.isArray(project.techStack) ? project.techStack.join(', ') : '',
  }
}
```

- [ ] **Step 3: Update `toPayload` to send `isThumbnail` and drop the manual `imageUrl`/`imageFilename` fields (server derives them)**

```js
function toPayload(form) {
  return {
    id: form.id.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    techStack: form.techStackText.split(',').map((item) => item.trim()).filter(Boolean),
    liveUrl: form.liveUrl.trim() || '#',
    sourceUrl: form.sourceUrl.trim() || '#',
    galleryImages: Array.isArray(form.galleryImages)
      ? form.galleryImages
          .filter((item) => String(item?.url || '').trim())
          .map((item, index) => ({
            id: String(item.id || `${form.id || 'project'}-gallery-${index + 1}`),
            url: String(item.url || '').trim(),
            filename: String(item.filename || '').trim() || deriveFilenameFromUrl(item.url),
            altText: String(item.altText || '').trim(),
            sortOrder: index + 1,
            isThumbnail: Boolean(item.isThumbnail),
          }))
      : [],
    type: form.type,
    sortOrder: Number(form.sortOrder) || 999,
    status: form.status,
  }
}
```

- [ ] **Step 4: Remove `imageUrl`/`imageFilename` from `emptyProject`**

```js
const emptyProject = {
  id: '',
  title: '',
  description: '',
  techStackText: '',
  liveUrl: '#',
  sourceUrl: '#',
  galleryImages: [],
  type: 'Automation',
  sortOrder: 999,
  status: 'published',
}
```

- [ ] **Step 5: Add `useSearchParams` and the `?projectId=` deep-link effect**

Inside `export default function ProjectsManager()`, add near the other `useState` calls:
```js
const [searchParams] = useSearchParams()
const [saveStage, setSaveStage] = useState(null)
```

Add a new effect after the existing `loadProjects` effect:
```js
useEffect(() => {
  const requestedId = searchParams.get('projectId')
  if (!requestedId || !projects.length) return
  const match = projects.find((project) => project.id === requestedId)
  if (match) {
    setSelectedProject(toFormProject(match))
    document.getElementById('project-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}, [searchParams, projects])
```
Add `id="project-editor"` to the `<form onSubmit={saveProject} ...>` element so the scroll target exists.

- [ ] **Step 6: Replace `uploadImage` with gallery-only staging functions**

Delete the entire `uploadImage` function (the old thumbnail upload handler). Replace `uploadGalleryImages` with a staging-only version that does not call `fetch`:

```js
async function addGalleryFiles(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  if (isReadOnlyPreview) {
    setStatus('Read-only preview mode. Configure R2 and the admin API before adding images.')
    event.target.value = ''
    return
  }

  try {
    const staged = []
    for (const file of files) {
      setStatus(`Validating ${file.name}...`)
      const prepared = await validateAndConvertToWebP(file)
      staged.push({
        id: `pending-${crypto.randomUUID()}`,
        url: URL.createObjectURL(prepared.file),
        filename: prepared.file.name,
        altText: '',
        isThumbnail: false,
        pending: true,
        file: prepared.file,
      })
    }

    setSelectedProject((current) => {
      const nextImages = [...(current.galleryImages || []), ...staged].map((item, index) => ({
        ...item,
        sortOrder: index + 1,
      }))
      return { ...current, galleryImages: nextImages }
    })
    setStatus(`${staged.length} image(s) staged. Save the project to upload and persist them.`)
  } catch (error) {
    setStatus(error.message || 'Image staging failed.')
  } finally {
    event.target.value = ''
  }
}
```

Add a new per-row replace handler:
```js
async function replaceGalleryImage(index, file) {
  if (isReadOnlyPreview) {
    setStatus('Read-only preview mode. Configure R2 and the admin API before replacing images.')
    return
  }

  try {
    setStatus(`Validating ${file.name}...`)
    const prepared = await validateAndConvertToWebP(file)

    setSelectedProject((current) => ({
      ...current,
      galleryImages: (current.galleryImages || []).map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, url: URL.createObjectURL(prepared.file), filename: prepared.file.name, pending: true, file: prepared.file }
          : item
      )),
    }))
    setStatus(`Replacement staged for slide ${index + 1}. Save the project to persist it.`)
  } catch (error) {
    setStatus(error.message || 'Image staging failed.')
  }
}
```

- [ ] **Step 7: Add `selectThumbnail`/`clearThumbnail`**

```js
function selectThumbnail(id) {
  setSelectedProject((current) => ({
    ...current,
    galleryImages: (current.galleryImages || []).map((item) => ({ ...item, isThumbnail: item.id === id })),
  }))
  setStatus('Thumbnail selection updated. Save the project to persist it.')
}

function clearThumbnail() {
  setSelectedProject((current) => ({
    ...current,
    galleryImages: (current.galleryImages || []).map((item) => ({ ...item, isThumbnail: false })),
  }))
  setStatus('Thumbnail cleared — the logo will show until a new one is selected. Save the project to persist it.')
}
```

- [ ] **Step 8: Update `updateGalleryImage` call sites to match the new row component's callback shape**

Keep `updateGalleryImage(index, updates)` exactly as it is today (it already takes a partial-update object) — `GalleryImageRow`'s `onUpdateAltText={(index, value) => updateGalleryImage(index, { altText: value })}` wraps it at the call site, no change to the function itself needed.

- [ ] **Step 9: Rewrite `saveProject` as a two-phase submit**

```js
async function saveProject(event) {
  event.preventDefault()
  if (isReadOnlyPreview) {
    setStatus('Read-only preview mode. Configure Cloudflare Worker, Access, D1, and R2 to save changes.')
    return
  }

  setIsSaving(true)
  setSaveStage('uploading')
  setStatus('Uploading staged images...')

  let uploadedGalleryImages
  try {
    uploadedGalleryImages = await uploadPendingGalleryImages(selectedProject.galleryImages, (fileName) => {
      setStatus(`Uploading ${fileName}...`)
    })
  } catch (error) {
    setStatus(error.message || 'Image upload failed. The project was not saved.')
    setIsSaving(false)
    setSaveStage(null)
    return
  }

  setSaveStage('saving')
  setStatus('Saving project...')

  const payload = toPayload({ ...selectedProject, galleryImages: uploadedGalleryImages })
  const method = projects.some((project) => project.id === payload.id) ? 'PUT' : 'POST'
  const url = method === 'PUT' ? `/api/admin/projects/${payload.id}` : '/api/admin/projects'

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!response.ok) {
      setStatus(data.error || `Save failed (${response.status}).`)
      return
    }

    setSelectedProject(toFormProject(data))
    await loadProjects({ preserveStatus: true })
    setStatus(`Project saved at ${new Date().toLocaleTimeString()}.`)
  } catch {
    setStatus('Project save failed.')
  } finally {
    setIsSaving(false)
    setSaveStage(null)
  }
}
```

- [ ] **Step 10: Add the unsaved-staged-changes guard**

Add near the other computed values:
```js
const hasPendingImages = (selectedProject.galleryImages || []).some((item) => item.pending)
```

Add a `beforeunload` effect (covers closing the tab/refreshing):
```js
useEffect(() => {
  function handleBeforeUnload(event) {
    if (!hasPendingImages) return
    event.preventDefault()
    event.returnValue = ''
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
  return () => window.removeEventListener('beforeunload', handleBeforeUnload)
}, [hasPendingImages])
```

Guard the two in-app actions that discard `selectedProject` — the project-list click handler and "New Project" button — by confirming first:
```js
onClick={() => {
  if (hasPendingImages && !window.confirm('You have unsaved image changes — leave anyway?')) return
  setSelectedProject(toFormProject(project))
  setShowHistory(false)
}}
```
(apply the same guard, with the same confirm message, to the "New Project" button's `onClick`, before it calls `setSelectedProject(emptyProject)`)

- [ ] **Step 11: Remove the "Image URL" text field**

Delete the `<label>` block for "Image URL" (the plain text input bound to `selectedProject.imageUrl`) — the thumbnail is now selected, never typed.

- [ ] **Step 12: Replace the gallery list JSX with `<GalleryImageRow>`**

Replace the `.map((galleryImage, index) => (...))` block (the inline row JSX) with:
```jsx
{selectedProject.galleryImages.map((galleryImage, index) => (
  <GalleryImageRow
    key={galleryImage.id || `${galleryImage.url}-${index}`}
    item={galleryImage}
    index={index}
    total={selectedProject.galleryImages.length}
    onUpdateAltText={(rowIndex, value) => updateGalleryImage(rowIndex, { altText: value })}
    onReplace={replaceGalleryImage}
    onRemove={removeGalleryImage}
    onMove={moveGalleryImage}
  />
))}
```
Update the "Add Gallery Images" file input's `onChange` to `addGalleryFiles` (was `uploadGalleryImages`).

- [ ] **Step 13: Replace "Clear Image" with "Clear Thumbnail" and remove the old upload control**

Delete the "Clear Image" button block and the "Upload / Replace Images" `<label>`/`<input>` block from the sidebar entirely. In their place, mount:
```jsx
<div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Thumbnail</p>
  <ThumbnailPicker
    galleryImages={selectedProject.galleryImages}
    onSelect={selectThumbnail}
    onClear={clearThumbnail}
  />
</div>
```

- [ ] **Step 14: Update the sidebar preview to use the flagged gallery row**

Replace:
```js
const previewImage = selectedProject.imageUrl || selectedProject.image
```
with:
```js
const previewImage = selectedProject.galleryImages.find((image) => image.isThumbnail)?.url || ''
```
Leave the existing `previewImage ? (<img .../>) : (<div>No project image selected.</div>)` JSX as-is — it already handles the falsy case (it'll now show "No project image selected" in the sidebar preview when nothing's flagged, while the public site itself falls back to the logo per Task 8; this sidebar copy can stay since it's describing the admin-only preview slot, not the public rendering).

- [ ] **Step 15: Update the Save button to show phase-specific text**

```jsx
<button
  type="submit"
  disabled={isSaving || isReadOnlyPreview}
  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
>
  <Save size={16} />
  {saveStage === 'uploading' ? 'Uploading images…' : saveStage === 'saving' ? 'Saving project…' : 'Save Project'}
  <ArrowRight size={16} />
</button>
```

- [ ] **Step 16: Manually verify in the browser**

Run `npm run dev`, open `/admin/content/projects`:
- Add gallery images — confirm they show a Pending badge and no network request fires until Save.
- Pick a thumbnail via the picker, Save — confirm the thumbnail badge/preview updates and `GET /api/admin/projects/{id}` shows the right `imageUrl`.
- Reload the page after staging images without saving — confirm they're gone (never persisted).
- Try removing a thumbnail-flagged row — confirm the button is disabled with the tooltip.
- Use per-row Replace on a saved image, Save — confirm the new file is live.

- [ ] **Step 17: Commit**

```bash
git add src/components/admin/ProjectsManager.jsx
git commit -m "feat: rewire ProjectsManager for deferred uploads and gallery-based thumbnail selection"
```

---

### Task 13: Media Library — Details/Medium-icons view toggle

**Files:**
- Create: `src/admin-app/components/MediaAssetGrid.jsx`
- Create: `src/admin-app/components/MediaAssetTable.jsx`
- Modify: `src/admin-app/pages/MediaLibraryPage.jsx`

**Interfaces:**
- Consumes: `asset.usedBy` (Task 7).
- Produces: `<MediaAssetGrid assets, busyKey, onReplace, onRemove />` and `<MediaAssetTable assets, busyKey, onReplace, onRemove />` — Task 14 wires the conflict dialog into both via the same `onRemove` prop.

- [ ] **Step 1: Extract the existing grid into `MediaAssetGrid.jsx`**

```jsx
// src/admin-app/components/MediaAssetGrid.jsx
import { ExternalLink, FolderOpen, RotateCw, Trash2 } from '../../components/icons/icons'
import { formatBytes } from '../lib/formatBytes'

function usedByLabel(usedBy) {
  if (!usedBy?.length) return null
  return usedBy.map((reference) => reference.label).join(', ')
}

export default function MediaAssetGrid({ assets, busyKey, onReplace, onRemove }) {
  if (!assets.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <FolderOpen className="mx-auto h-8 w-8 text-slate-400" />
        <h2 className="mt-3 font-semibold text-slate-800">No image objects found</h2>
        <p className="mt-2 text-sm text-slate-500">Upload a JPG, PNG, WebP, or AVIF. The CMS will resize it when needed and store an optimized WebP.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {assets.map((asset) => (
        <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <img src={asset.url} alt={asset.altText || asset.filename} className="h-40 w-full bg-slate-50 object-cover" loading="lazy" />
          <div className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-slate-800">{asset.filename}</p><a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.filename}`}><ExternalLink className="h-4 w-4 text-slate-400 hover:text-violet-600" /></a></div>
            <p className="truncate font-mono text-[11px] text-slate-500" title={asset.key}>{asset.key}</p>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{formatBytes(asset.size)}</span><span className={asset.trackedInD1 ? 'text-emerald-600' : 'text-slate-400'}>{asset.trackedInD1 ? 'D1 linked' : 'R2 only'}</span></div>
            {usedByLabel(asset.usedBy) ? (
              <p className="truncate text-xs text-violet-700" title={usedByLabel(asset.usedBy)}>Used by: {usedByLabel(asset.usedBy)}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCw className="h-3.5 w-3.5" />{busyKey === asset.key ? 'Working…' : 'Replace'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={Boolean(busyKey)} onChange={(event) => { onReplace(asset, event.target.files?.[0]); event.target.value = '' }} /></label>
              <button type="button" disabled={Boolean(busyKey)} onClick={() => onRemove(asset)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Move `formatBytes` into a shared helper if it isn't already one**

Read `src/admin-app/pages/MediaLibraryPage.jsx` in full to find where `formatBytes` is currently defined. If it's a local function in that file, create `src/admin-app/lib/formatBytes.js` exporting it (`export function formatBytes(bytes) { ... }` with the exact existing implementation), then delete the local copy from `MediaLibraryPage.jsx` and import it from there instead — both new components need it.

- [ ] **Step 3: Create `MediaAssetTable.jsx` (Details view)**

```jsx
// src/admin-app/components/MediaAssetTable.jsx
import { ExternalLink, FolderOpen, RotateCw, Trash2 } from '../../components/icons/icons'
import { formatBytes } from '../lib/formatBytes'

function usedByLabel(usedBy) {
  if (!usedBy?.length) return '—'
  return usedBy.map((reference) => reference.label).join(', ')
}

export default function MediaAssetTable({ assets, busyKey, onReplace, onRemove }) {
  if (!assets.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <FolderOpen className="mx-auto h-8 w-8 text-slate-400" />
        <h2 className="mt-3 font-semibold text-slate-800">No image objects found</h2>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Thumbnail</th>
            <th className="px-3 py-2">Filename</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Folder</th>
            <th className="px-3 py-2">D1</th>
            <th className="px-3 py-2">Used by</th>
            <th className="px-3 py-2">Uploaded</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td className="px-3 py-2"><img src={asset.url} alt={asset.altText || asset.filename} className="h-10 w-14 rounded object-cover" loading="lazy" /></td>
              <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-slate-800" title={asset.filename}>
                {asset.filename}
                <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.filename}`} className="ml-1 inline-block align-middle"><ExternalLink className="h-3.5 w-3.5 text-slate-400 hover:text-violet-600" /></a>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatBytes(asset.size)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{asset.folder}</td>
              <td className="whitespace-nowrap px-3 py-2"><span className={asset.trackedInD1 ? 'text-emerald-600' : 'text-slate-400'}>{asset.trackedInD1 ? 'Linked' : 'R2 only'}</span></td>
              <td className="max-w-[220px] truncate px-3 py-2 text-violet-700" title={usedByLabel(asset.usedBy)}>{usedByLabel(asset.usedBy)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-500">{new Date(asset.uploadedAt).toLocaleDateString()}</td>
              <td className="whitespace-nowrap px-3 py-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCw className="h-3 w-3" />{busyKey === asset.key ? '…' : 'Replace'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={Boolean(busyKey)} onChange={(event) => { onReplace(asset, event.target.files?.[0]); event.target.value = '' }} /></label>
                  <button type="button" disabled={Boolean(busyKey)} onClick={() => onRemove(asset)} className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3 w-3" />Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`asset.uploadedAt` is the exact field name the `GET /api/admin/media` handler returns (confirmed in Task 7 Step 1) — no adjustment needed here.

- [ ] **Step 4: Add the view toggle to `MediaLibraryPage.jsx`**

Add near the other imports:
```jsx
import { useSearchParams } from 'react-router-dom'
import MediaAssetGrid from '../components/MediaAssetGrid'
import MediaAssetTable from '../components/MediaAssetTable'
```

Inside the component, add:
```js
const [searchParams, setSearchParams] = useSearchParams()
const view = searchParams.get('view') === 'details' ? 'details' : 'grid'
```

Add a toggle control near the page header (alongside the existing "Upload Image" button):
```jsx
<div className="inline-flex rounded-md border border-slate-300 bg-white p-1 text-sm font-semibold text-slate-700">
  <button type="button" onClick={() => setSearchParams((params) => { params.set('view', 'grid'); return params })} className={`rounded px-3 py-1.5 ${view === 'grid' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>Medium icons</button>
  <button type="button" onClick={() => setSearchParams((params) => { params.set('view', 'details'); return params })} className={`rounded px-3 py-1.5 ${view === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>Details</button>
</div>
```

Replace the existing inline grid JSX (the `{assets.length ? <div className="grid ...">...</div> : <div>...</div>}` block) with:
```jsx
{view === 'grid'
  ? <MediaAssetGrid assets={assets} busyKey={busyKey} onReplace={replace} onRemove={remove} />
  : <MediaAssetTable assets={assets} busyKey={busyKey} onReplace={replace} onRemove={remove} />}
```

- [ ] **Step 5: Manually verify**

Run `npm run dev`, open `/admin/media`, toggle between Medium icons and Details, confirm both render the same assets with correct data, and that "Used by" shows the right project title where applicable (per Task 7's `usedBy` field). Confirm `asset.createdAt` (or whatever the actual field is) renders a real date, not "Invalid Date" — adjust `MediaAssetTable.jsx` if the field name was wrong in Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/admin-app/components/MediaAssetGrid.jsx src/admin-app/components/MediaAssetTable.jsx src/admin-app/pages/MediaLibraryPage.jsx src/admin-app/lib/formatBytes.js
git commit -m "feat: add Details/Medium-icons view toggle with used-by visibility to Media Library"
```

---

### Task 14: Delete-conflict dialog with navigation

**Files:**
- Create: `src/admin-app/components/MediaDeleteConflictDialog.jsx`
- Modify: `src/admin-app/pages/MediaLibraryPage.jsx`

**Interfaces:**
- Consumes: `references` array from a 409 response (Task 4's consolidated shape: `{ type, id, label, isThumbnail }`), `useNavigate` from `react-router-dom`.
- Produces: nothing new for later tasks — this is the last UI piece.

- [ ] **Step 1: Create the dialog component**

```jsx
// src/admin-app/components/MediaDeleteConflictDialog.jsx
import { useNavigate } from 'react-router-dom'
import { X } from '../../components/icons/icons'

function describeReference(reference) {
  if (reference.type === 'Project') {
    return reference.isThumbnail
      ? `This image is the active thumbnail for project "${reference.label}". Update the thumbnail before deleting this image.`
      : `This image is used in the gallery for project "${reference.label}".`
  }
  return `Used by ${reference.type}: ${reference.label}`
}

export default function MediaDeleteConflictDialog({ references, onClose }) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">This image is still in use</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <ul className="mt-4 space-y-3">
          {references.map((reference, index) => (
            <li key={`${reference.type}-${reference.id}-${index}`} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>{describeReference(reference)}</p>
              {reference.type === 'Project' ? (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/content/projects?projectId=${encodeURIComponent(reference.id)}`)}
                  className="mt-2 text-sm font-semibold text-violet-700 hover:underline"
                >
                  Go to project
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm `X` exists in the shared icon module**

Read `src/components/icons/icons.js` (or `.jsx`) — if there's no `X` export, use whichever close-icon name that file already exports.

- [ ] **Step 3: Wire the dialog into `MediaLibraryPage.jsx`'s `remove()`**

Add state near the other `useState` calls:
```js
const [conflictReferences, setConflictReferences] = useState(null)
```

Replace the body of `remove()`:
```js
async function remove(asset) {
  if (!window.confirm(`Delete “${asset.filename}” from R2? This is only allowed when the image is not referenced by content.`)) return
  setBusyKey(asset.key)
  setMessage(null)
  try {
    await mediaRequest('DELETE', null, `?key=${encodeURIComponent(asset.key)}`)
    setMessage({ tone: 'success', text: `Deleted ${asset.filename}.` })
    await loadAssets()
  } catch (error) {
    if (error.references?.length) {
      setConflictReferences(error.references)
    } else {
      setMessage({ tone: 'error', text: error.message })
    }
  } finally { setBusyKey('') }
}
```

Add the import and mount point:
```jsx
import MediaDeleteConflictDialog from '../components/MediaDeleteConflictDialog'
```
```jsx
{conflictReferences ? (
  <MediaDeleteConflictDialog references={conflictReferences} onClose={() => setConflictReferences(null)} />
) : null}
```
(mount this once near the top of the component's returned JSX, alongside the other top-level conditional blocks like `{message ? ... : null}`)

- [ ] **Step 4: Manually verify**

Run `npm run dev`, attempt to delete a project's thumbnail image from `/admin/media` — confirm the dialog appears with the correct "active thumbnail" message, and that clicking "Go to project" navigates to `/admin/content/projects?projectId=<id>` and auto-selects/scrolls to that project (per Task 12 Step 5).

- [ ] **Step 5: Commit**

```bash
git add src/admin-app/components/MediaDeleteConflictDialog.jsx src/admin-app/pages/MediaLibraryPage.jsx
git commit -m "feat: replace delete-conflict alert with an actionable dialog linking to the owning project"
```

---

### Task 15: E2E coverage

**Files:**
- Modify: `tests/e2e/admin.spec.js`

**Interfaces:**
- Consumes: the full feature surface built in Tasks 1-14.

- [ ] **Step 1: Read the existing `admin.spec.js` in full**

Confirm the existing login/setup helpers (how tests authenticate into `/admin`, what fixtures or test projects already exist) before adding new tests, so new tests reuse the same setup pattern rather than inventing a second one.

- [ ] **Step 2: Add a test for deferred upload (nothing persists before Save)**

```js
test('staged gallery images are not uploaded until Save is clicked', async ({ page }) => {
  await page.goto('/admin/content/projects')
  // ... reuse this file's existing pattern for selecting/creating a test project ...
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Add Gallery Images').click(),
  ])
  await fileChooser.setFiles('tests/e2e/fixtures/sample-image.png')
  await expect(page.getByText('Pending')).toBeVisible()

  const mediaRequestPromise = page.waitForRequest('**/api/admin/media', { timeout: 2000 }).catch(() => null)
  await page.reload()
  await expect(mediaRequestPromise).resolves.toBeNull()
  await expect(page.getByText('Pending')).not.toBeVisible()
})
```
(If `tests/e2e/fixtures/sample-image.png` doesn't exist yet, add a small PNG fixture there — check `tests/e2e/fixtures/` first in case a suitable image already exists to reuse.)

- [ ] **Step 3: Add a test for thumbnail selection + Save persisting `imageUrl`**

```js
test('selecting a gallery image as thumbnail persists projects.imageUrl on save', async ({ page }) => {
  await page.goto('/admin/content/projects')
  // ... select/create a test project, stage a gallery image via the pattern from Step 2 ...
  await page.getByRole('button', { name: 'Save Project' }).click()
  await expect(page.getByText(/Uploading images/)).toBeVisible()
  await expect(page.getByText(/Project saved at/)).toBeVisible()

  // pick the newly-uploaded thumbnail in the picker (first tile) and save again
  await page.locator('[data-testid="thumbnail-picker-tile"]').first().click()
  await page.getByRole('button', { name: 'Save Project' }).click()
  await expect(page.getByText(/Project saved at/)).toBeVisible()

  const response = await page.request.get('/api/admin/projects')
  const projects = await response.json()
  const saved = projects.find((project) => project.id === /* the test project's id */ undefined)
  expect(saved.imageUrl).toBeTruthy()
})
```
Add a `data-testid="thumbnail-picker-tile"` attribute to the `<button>` inside `ThumbnailPicker.jsx`'s `.map(...)` (go back and add this to Task 11's component) so this selector is stable.

- [ ] **Step 4: Add a test for blocked thumbnail removal**

```js
test('removing the thumbnail-flagged gallery image is blocked', async ({ page }) => {
  await page.goto('/admin/content/projects')
  // ... open a project that already has a thumbnail-flagged gallery image ...
  await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeDisabled()
})
```

- [ ] **Step 5: Add a test for the delete-conflict dialog and navigation**

```js
test('deleting a used image shows the conflict dialog and links to the project', async ({ page }) => {
  await page.goto('/admin/media')
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await expect(page.getByText('This image is still in use')).toBeVisible()
  await page.getByRole('button', { name: 'Go to project' }).click()
  await expect(page).toHaveURL(/\/admin\/content\/projects\?projectId=/)
})
```

- [ ] **Step 6: Add a test for the Media Library view toggle**

```js
test('Media Library toggles between Medium icons and Details views', async ({ page }) => {
  await page.goto('/admin/media')
  await expect(page.locator('table')).toHaveCount(0)
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.locator('table')).toBeVisible()
  await page.getByRole('button', { name: 'Medium icons' }).click()
  await expect(page.locator('table')).toHaveCount(0)
})
```

- [ ] **Step 7: Run the full e2e suite**

Run: `npm run test:e2e`
Expected: PASS for all new tests (adjust selectors/test-project setup to match whatever this file's existing helpers actually look like once you've read it in Step 1 — the snippets above show intent, not verbatim final code, since they depend on fixtures this plan hasn't seen).

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/admin.spec.js tests/e2e/fixtures/sample-image.png
git commit -m "test: add e2e coverage for deferred uploads, thumbnail selection, and delete conflicts"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (Media Library views) → Task 13. §2 (deferred upload) → Tasks 9, 12. §3 (thumbnail selection) → Tasks 11, 12. §4 (schema/`is_thumbnail`) → Tasks 2, 5. §5 (blocked removal) → Task 10. §6 (delete-conflict dialog) → Tasks 4, 14. §7 (real cleanup on removal) → Task 5. §8 (per-gallery Replace) → Tasks 10, 12. Logo fallback → Task 8. `env`-threading needed for Task 5's cleanup to run in production → Task 6. `usedBy` visibility needed by Tasks 13/14 → Task 7.
- **No unit test infra existed** for the worker/repository layer before this plan — Task 1 adds Vitest scoped to pure logic only, consistent with the Global Constraints note; DB/R2-touching behavior is covered by Task 15's e2e suite and each task's manual-verification step, not invented mocks.
- **Type/shape consistency check:** the gallery item shape `{ id, url, filename, altText, sortOrder, isThumbnail, pending, file }` is introduced in Task 12 Step 2 and used identically by Task 9 (`projectImageUpload.js`), Task 10 (`GalleryImageRow`), and Task 11 (`ThumbnailPicker`) — all reference the same field names (`isThumbnail`, `pending`, `file`). `upsertProject(db, input, env = {})`'s signature (Task 5) matches every call site updated in Task 6.
