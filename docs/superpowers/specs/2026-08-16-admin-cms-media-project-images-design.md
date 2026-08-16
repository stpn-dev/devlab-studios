# Admin CMS — Media Library & Project Images Overhaul — Design Spec

## Goal

Fix three tangled problems in the Admin CMS around images:

1. **Media Library** (`/admin/media`) has no way to tell which project (or other content) an image belongs to, and only offers one grid/card view.
2. **Project image uploads bypass the Save button** — selecting a file uploads straight to R2 immediately, so abandoned edits leave orphaned storage, and "replacing" a thumbnail doesn't reliably update what's shown because the upload control and the Save transaction are disconnected.
3. The project editor's "Upload / Replace Images" control for the single thumbnail is a separate upload path from "Gallery Images," which is confusing UX and the root cause of #2's staleness — the thumbnail should instead be *selected* from the project's own Gallery Images, not independently uploaded.

Everywhere an image is superseded (Media Library replace, per-project gallery replace, gallery image removal), the old file must be genuinely deleted from storage (not orphaned) unless it's still referenced by other content.

## Current State

- **Media Library** (`src/admin-app/pages/MediaLibraryPage.jsx`): grid/card view only, sourced from `GET /api/admin/media` (`src/pages/api/admin/media.ts:78-127`), which lists the live R2 bucket and left-joins `media_assets` (D1) for metadata. No "used by" info is shown in the list; `findMediaReferences` (`src/worker/repositories/mediaAssets.js:46-62`) is only invoked server-side during delete (to block) and replace (to rewrite), never during GET.
- **Project editor** (`src/components/admin/ProjectsManager.jsx`, route `/admin/content/projects`): a bespoke editor (intentionally not on the generic `SchemaForm` system — see `ContentTypePage.jsx:10-19`). Sidebar has a single-file "Upload / Replace Images" control (`ProjectsManager.jsx:895-906`, handler `uploadImage` at 238-306) for the thumbnail, and a separate "Gallery Images" `multiple` file input (760-772, handler `uploadGalleryImages` at 308-366). Both handlers immediately `POST` each file to `/api/admin/media` (creating a new R2 object right away) and merge the resulting URL into local React state — nothing touches the `projects` table until `saveProject()` (169-204) is called.
- **Schema**: `projects.image_url`/`image_filename` are plain string columns (`migrations/0001_cms_foundation.sql`), unrelated by FK to anything. `project_gallery_images` (`migrations/0002_project_gallery_images.sql`) is a real child table (`project_id → projects.id`, cascade) but also just stores a raw `url` string — no link to `media_assets`. `media_assets` (`migrations/0001_cms_foundation.sql:19-30`) is a standalone R2-metadata table with no FK to anything; "which project owns this image" is computed at request time by string-matching URLs (`MEDIA_REFERENCE_QUERIES` in `mediaAssets.js:32-44`).
- **Save flow** (`upsertProject`, `syncProjectGallery` in `src/worker/repositories/projects.js:144-232`): `INSERT ... ON CONFLICT DO UPDATE` for the project row; gallery sync deletes all existing `project_gallery_images` rows for the project and re-inserts the full submitted list every save. Neither path ever touches R2 or `media_assets` for images that disappear from the submitted list — those become orphaned storage.
- **Media Library's own Replace** (`PATCH /api/admin/media`, `media.ts:172-217`) is already correct: uploads to a new key, rewrites every referencing table via `replaceMediaReferences`, and only then deletes the old R2 object + `media_assets` row (with rollback on failure). This is the reference behavior the rest of the design mirrors.
- **Delete** (`DELETE /api/admin/media`, `media.ts:219-236`) blocks with a 409 + `references` array when `findMediaReferences` finds any usage; the client (`MediaLibraryPage.jsx:84-96`) currently just concatenates `references` into a flat error string with `window.confirm` for the initial prompt — no structured UI, no navigation.

## Component Designs

### 1. Media Library — two views + "used by" visibility

**Modified:** `src/admin-app/pages/MediaLibraryPage.jsx`, `src/pages/api/admin/media.ts`, `src/worker/repositories/mediaAssets.js`

- Add a view toggle mirroring Windows Explorer's View menu naming: **Medium icons** (existing grid/card view, default) and **Details** (new table view). Toggle state persists via a query param (`?view=details`) so it survives refresh.
- **Details view** columns: thumbnail, filename, key, size, folder, D1-linked badge, **Used by**, created date, Replace/Delete actions.
- **Medium icons view**: existing cards, with a new "Used by" line/badge added under the existing D1-linked badge.
- Backend: extend `GET /api/admin/media` to batch-call `findMediaReferences` for all listed assets in one pass and attach `usedBy: [{ type, id, label, isThumbnail }]` per asset (see §6 for the query consolidation that produces `isThumbnail`).
- Loading state: per-view skeleton placeholders. Empty state: per-view empty message (already exists for the grid; add the Details-view equivalent).

### 2. Deferred upload — nothing persists before Save

**Modified:** `src/components/admin/ProjectsManager.jsx`

- Selecting file(s) for Gallery Images (and the new per-row Replace, §8) runs the existing client-side `validateAndConvertToWebP` (unchanged, `src/utils/imageUpload.js`) but **stops there** — the converted `Blob` plus a local `URL.createObjectURL` preview are held in component state as a "pending" gallery item. No `POST /api/admin/media` call happens at selection time.
- Pending items are visually distinct: dashed border + a **Pending** badge, so the admin always knows what exists only in this editing session.
- `saveProject()` becomes two phases:
  1. Upload every pending blob to `/api/admin/media` in parallel, collecting real URLs/keys. Any failure aborts the whole save with an error naming which file(s) failed and offering retry — the project record is untouched.
  2. Send the full payload (now all-real URLs, including the thumbnail-flagged row) to the existing `PUT/POST /api/admin/projects`.
- Save button shows distinct progress text per phase ("Uploading images…" → "Saving project…") instead of one opaque spinner.
- Navigating away or closing the editor with pending/staged changes triggers a confirmation prompt ("You have unsaved image changes — leave anyway?").
- Net effect: cancel or navigate away before Save, and nothing was ever written to R2 or D1.

### 3. Thumbnail becomes a selection, not an upload

**Modified:** `src/components/admin/ProjectsManager.jsx`

- Remove the sidebar's "Upload / Replace Images" file input (`ProjectsManager.jsx:895-906`) and its handler `uploadImage` entirely.
- Replace it with a **thumbnail picker**: the project's current Gallery Images (staged or saved) rendered as small selectable tiles; clicking one toggles `is_thumbnail` for that row (exactly one may be selected). Selected tile gets a clear checkmark/ring.
- If Gallery Images is empty, the picker renders a disabled/empty state ("Add gallery images first — no selection possible").
- If no row is flagged as thumbnail (empty gallery, or explicitly cleared), the sidebar preview *and* the public-facing project card fall back to the company logo — a pure rendering fallback (`project.imageUrl || LOGO_PATH`); nothing is written to the DB to represent "logo default." The sidebar preview always shows exactly what the public site will render, before Save.
- The existing "Clear Image" button (844-860) is removed — clearing is now just "select no thumbnail," handled by the picker itself.

### 4. Thumbnail model — `is_thumbnail` flag + derived `projects.image_url`

**Modified:** `migrations/0007_project_gallery_thumbnail.sql` (new), `src/worker/repositories/projects.js`

```sql
ALTER TABLE project_gallery_images ADD COLUMN is_thumbnail INTEGER NOT NULL DEFAULT 0;
```

Backfill in the same migration: for every project with a non-null `image_url`, if a `project_gallery_images` row already has that exact URL, set `is_thumbnail = 1` on it; otherwise **insert** a new gallery row cloning `image_url`/`image_filename` with `is_thumbnail = 1`, `sort_order = -1` (sorts first). This guarantees no currently-published project silently loses its visible thumbnail during migration — every existing thumbnail becomes a normal (flagged) gallery row.

`upsertProject`/`syncProjectGallery` changes: `projects.image_url`/`image_filename` are no longer submitted directly by the client. Instead, after the submitted gallery list is written, the repository derives `image_url`/`image_filename` from whichever row (if any) has `is_thumbnail = true`, and writes that onto the `projects` row (or clears both to `null` if no row is flagged). This keeps the public site's existing read path (`projects.image_url`) completely unchanged — it has no idea the thumbnail is now "selected" rather than "uploaded."

Validation: the submitted gallery list may contain **at most one** `is_thumbnail: true` row; reject (400) otherwise.

### 5. Blocked removal of the thumbnail-flagged image

**Modified:** `src/components/admin/ProjectsManager.jsx`

- The Remove button on a gallery row that currently has `is_thumbnail = true` is disabled, with a tooltip: "Choose a different thumbnail before removing this image."
- This is UI-level only (the picker in §3 is the only way to change which row is flagged, and a flagged row simply can't be removed until another is chosen or the selection is cleared).

### 6. Delete-conflict dialog with navigation

**Modified:** `src/admin-app/pages/MediaLibraryPage.jsx` (new `MediaDeleteConflictDialog` component), `src/worker/repositories/mediaAssets.js`, `src/admin-app/pages/ContentTypePage.jsx` / `src/components/admin/ProjectsManager.jsx`

- Consolidate `mediaAssets.js`'s separate `Project cover` and `Project gallery` reference queries (`MEDIA_REFERENCE_QUERIES`, lines 33-34) into a single `Project` type that joins `project_gallery_images → projects` for the title and includes `is_thumbnail` (aliased `isThumbnail`) so callers know *which kind* of usage it is:
  ```sql
  SELECT project_gallery_images.project_id AS id,
         projects.title AS label,
         project_gallery_images.is_thumbnail AS isThumbnail
  FROM project_gallery_images
  JOIN projects ON projects.id = project_gallery_images.project_id
  WHERE project_gallery_images.url = ?
  ```
  (The old `projects.image_url = ?` query is dropped — `image_url` is now derived from a flagged gallery row, so matching gallery rows already covers it, with no duplicate entries.)
- Replace `MediaLibraryPage.jsx`'s `window.confirm` + flat error string (`remove()`, lines 84-96) with a conflict dialog, shown whenever a delete attempt returns 409 with `references`.
- Dialog messaging per reference:
  - `type === 'Project' && isThumbnail`: "This image is the active thumbnail for project '<label>'. Update the thumbnail before deleting this image." + **Go to project** button.
  - `type === 'Project' && !isThumbnail`: "This image is used in the gallery for project '<label>'." + **Go to project** button.
  - Any other `type` (article, certification, experience, testimonial, case-study, page section, site setting, SEO image): plain descriptive text, no link — those editors are out of scope here.
- **Go to project** navigates (via `useNavigate()`) to `/admin/content/projects?projectId=<id>`.
- `ProjectsManager` gains new support for the `projectId` query param (none exists today): once its project list loads, if the param matches a loaded project, auto-select it (`setSelectedProject(toFormProject(match))`) and scroll the editor panel into view.
- The delete-blocking policy itself is unchanged (server still refuses delete while references exist) — this is messaging + navigation only.

### 7. Real cleanup when gallery images are removed

**Modified:** `src/worker/repositories/projects.js`

- Before `syncProjectGallery` replaces a project's `project_gallery_images` rows, diff the previous URLs against the submitted ones.
- For each URL being removed, run `findMediaReferences` (same check the Media Library's manual delete uses): if it's not referenced anywhere else (no other project, article, etc.), delete its R2 object and `media_assets` row for real.
- If it *is* still referenced elsewhere, leave the object in place.
- This is the same rule the Media Library's own Replace already follows (§ Current State) — now applied automatically from project saves, not just a manual delete button.

### 8. Per-gallery-image Replace (parity with Media Library's Replace)

**Modified:** `src/components/admin/ProjectsManager.jsx`, `src/worker/repositories/projects.js`

- Each gallery image row (currently Up/Down/Remove only) gets its own **Replace** control, same pattern as the Media Library card's Replace button.
- Selecting a file runs the same client-side WebP conversion and stages it as a **pending replacement** for that specific row (same Pending-badge treatment as §2) — the row keeps its id, alt text, sort order, and `is_thumbnail` flag; only the backing file changes once saved.
- On Save, the staged replacement uploads first (§2's phase one); that row's `url`/`filename` in the payload switches to the new URL while everything else about the row is untouched — replacing a thumbnail's file doesn't require re-picking it as thumbnail afterward.
- After a successful save, the §7 cleanup rule applies to the row's *old* URL: delete for real unless still referenced elsewhere.
- Cancelling before Save reverts cleanly (§2's deferred-upload guarantee).

## Data Flow Summary

```
Select gallery file(s) / replacement  →  client-side WebP convert  →  held as pending blob (no network)
                                                                              │
                                              Save Project clicked ──────────┘
                                                        │
                                     phase 1: POST each pending blob → /api/admin/media
                                                        │  (real URL/key returned)
                                     phase 2: PUT/POST /api/admin/projects
                                          { gallery: [{ url, altText, sortOrder, isThumbnail }, ...] }
                                                        │
                                     upsertProject → syncProjectGallery:
                                       - diff old vs new gallery URLs → delete orphaned old files (§7)
                                       - write new gallery rows
                                       - derive projects.image_url/image_filename from is_thumbnail row (§4)
```

## Testing

- **Unit** (`src/worker/repositories/projects.test.*` or equivalent): `syncProjectGallery`'s thumbnail derivation (flagged row → `image_url`; no flagged row → `null`), the orphan-diff cleanup logic (mocked `findMediaReferences`), and the "at most one `is_thumbnail`" validation.
- **Unit**: migration backfill logic (existing `image_url` matches a gallery row → flag it; no match → insert a cloned row).
- **E2E** (`tests/e2e/admin.spec.js`, Playwright):
  - Add gallery images, pick a thumbnail, Save → verify persisted (reload confirms).
  - Select gallery images then navigate away without saving → reload confirms nothing was uploaded/persisted (no orphan R2 objects, no DB rows).
  - Attempt to remove a thumbnail-flagged gallery row → verify blocked with tooltip.
  - Delete a media asset that's a project's thumbnail from the Media Library → verify the conflict dialog appears with correct messaging and that "Go to project" navigates to and auto-selects the right project.
  - Replace a specific gallery image's file → Save → verify the new file is live and the old R2 object/`media_assets` row is gone (when unreferenced elsewhere).
  - Media Library view toggle (Medium icons ↔ Details) renders the same underlying assets correctly in both modes, including the "Used by" column/badge.

## Rollout

- Migration `0007_project_gallery_thumbnail.sql` must run before the new `ProjectsManager`/`projects.js` code deploys (backfill guarantees no published project's thumbnail disappears).
- No public-site changes required — `projects.image_url` remains the single read path public pages use; only how it gets *written* changes.
