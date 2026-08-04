# Cross-Platform Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make devlab-studios load and render smoothly across differing platforms (mobile Safari/iOS, desktop Safari, Chrome, Firefox, varying pixel densities) by actually enabling the image-optimization pipeline the Astro migration was supposed to deliver, fixing the layout-shift and GPU-compositing costs that ride along with it, and adding automated cross-browser coverage so regressions are caught instead of discovered by users.

**Architecture:** `astro.config.mjs` currently sets `imageService: 'passthrough'`, which — verified by inspecting `@astrojs/cloudflare`'s source and a real `astro build` — makes every `astro:assets` call a no-op; images ship byte-identical to their 6.2 MB source. The fix switches to Cloudflare's native Workers `images` binding (the adapter's default when `imageService` is unset), which does on-the-fly resize + AVIF/WebP negotiation at the edge. That alone only helps images already routed through `astro:assets`' `<Image>` component (3 vector illustrations on the homepage). The bulk of the weight — 16 project screenshots and 4 certificate badges — flows through React islands (`PortfolioRow.jsx`, `CertificationsGallery.jsx`) as plain `<img src="...">` strings, which bypass Astro's image pipeline entirely regardless of the config fix. This plan adds a shared server-side optimizer (`getImage()` called from the `.ts` content loaders, before data crosses the island boundary) that pre-builds `<picture>`-ready `{src, width, height, avifSrcSet, webpSrcSet}` descriptors with **explicit, fixed target dimensions** (not `inferSize`), so no extra network round-trip is added to SSR render time — the transform cost is deferred entirely to the browser's first request for the already-cached `/_image` URL.

**Tech Stack:** Astro 7 (`output: 'server'`), `@astrojs/cloudflare` adapter, Cloudflare Workers (`images` binding), React 19 islands, Tailwind CSS, Playwright.

## Global Constraints

- Node >=22.12.0 (from `package.json` engines).
- TypeScript files: explicit types on exported functions/interfaces; no `any` (project rule, see `rules/typescript/coding-style.md`).
- Immutability: use spread (`{ ...x }`) for all updates, never mutate in place — matches existing style throughout `src/lib/content/*.ts`.
- No `console.log` in committed code.
- Commit format: `<type>: <description>` (conventional commits — `feat`, `fix`, `perf`, `test`, `chore`).
- Do not touch `wrangler.jsonc`'s `env.preview` block — the `images` binding is account-level, not per-environment, so it belongs at the top level only (confirmed: `d1_databases`/`r2_buckets` are the only per-env-overridden keys today).
- Every task must be verifiable with `npm run build && npm run preview` locally — no step should require an actual `wrangler deploy` to confirm it works, because `@astrojs/cloudflare`'s `astro preview` runs the real Miniflare/workerd runtime locally, including the `images` binding.

---

## File Structure

| File | Responsibility |
|---|---|
| `wrangler.jsonc` | Add the `images` binding so the Workers runtime can resize/transcode. |
| `astro.config.mjs` | Drop `imageService: 'passthrough'`; allow-list the two R2 hostnames for remote image optimization. |
| `src/lib/images/optimizeImage.ts` (new) | Single shared helper: given a local `ImageMetadata` or remote URL + target size, returns a `<picture>`-ready descriptor (avif/webp srcsets, explicit width/height). |
| `src/components/ResponsivePicture.jsx` (new) | Renders a `<picture>` element from that descriptor — the one place all islands get AVIF/WebP negotiation + explicit dimensions for free. |
| `src/lib/content/projects.ts` | Stop unwrapping local image imports to a bare string before they're used; attach an `optimizedImage`/`galleryImages[].optimized` descriptor per project. |
| `src/lib/content/profile.ts` | Same treatment for certification badge images. |
| `src/components/PortfolioRow.jsx` | Render cover + gallery images via `ResponsivePicture` instead of raw `<img>`. |
| `src/components/islands/CertificationsGallery.jsx` | Render badge thumbnails via `ResponsivePicture`. |
| `src/components/ImageModal.jsx` | Accept the same descriptor shape for the lightbox view. |
| `src/components/Footer.astro` | Add explicit `width`/`height` to the logo `<img>` (independent, zero-dependency CLS fix). |
| `src/layouts/Layout.astro` | Cut decorative blur layers from 3 to 2 and shrink blur radii — Safari's filter compositing is the most expensive of the major engines. |
| `src/index.css` | Change `body::before`/`::after` from `position: fixed` to `position: absolute` — avoids repaint-on-scroll cost for a purely decorative background texture. |
| `playwright.config.js` | Add WebKit desktop + Mobile Safari projects so "smooth across platforms" is actually asserted, not assumed. |
| `tests/e2e/image-weight.spec.js` (new) | Automated regression guard: fails today (RED), passes once the pipeline is wired up (GREEN). |

---

### Task 1: Write the failing image-weight budget test

**Files:**
- Create: `tests/e2e/image-weight.spec.js`
- Modify: `playwright.config.js:30` (add the new spec to the `static` project's `testMatch`)

**Interfaces:**
- Produces: a Playwright test suite that measures total bytes of `image/*` responses per page and asserts a budget. Later tasks are judged against it.

- [ ] **Step 1: Write the test**

```javascript
// tests/e2e/image-weight.spec.js
import { test, expect } from '@playwright/test'

// Budgets are for total image bytes transferred on first load, not full
// page weight. Tightened once the optimization pipeline (Tasks 2-6) lands;
// see docs/performance/baseline-2026-07-31/README.md for the pre-fix
// reference numbers (Home: 583 KiB total, Profile: 862 KiB total).
const IMAGE_BUDGETS_KB = {
  '/': 150,
  '/profile': 700,
}

async function measureImageBytes(page, path) {
  let totalBytes = 0

  page.on('response', async (response) => {
    const contentType = response.headers()['content-type'] || ''
    if (!contentType.startsWith('image/')) return
    const body = await response.body().catch(() => null)
    if (body) totalBytes += body.length
  })

  await page.goto(path, { waitUntil: 'networkidle' })
  return totalBytes
}

for (const [path, budgetKb] of Object.entries(IMAGE_BUDGETS_KB)) {
  test(`${path} keeps total image weight under ${budgetKb}KB`, async ({ page }) => {
    const totalBytes = await measureImageBytes(page, path)
    expect(totalBytes / 1024).toBeLessThan(budgetKb)
  })
}
```

- [ ] **Step 2: Register the spec with the `static` Playwright project**

In `playwright.config.js`, change:
```javascript
testMatch: /(public-pages|contact-form)\.spec\.js/,
```
to:
```javascript
testMatch: /(public-pages|contact-form|image-weight)\.spec\.js/,
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx playwright test image-weight --project=static`
Expected: FAIL on both `/` and `/profile` — home ships ~212 KB of uncompressed PNGs through `<Image>` already (over the 150 KB budget), and profile ships several times its 700 KB budget once certificate badges and portfolio screenshots render. This is the numeric proof that the passthrough image service is the dominant cost.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/image-weight.spec.js playwright.config.js
git commit -m "test: add failing image-weight budget guard for home and profile"
```

---

### Task 2: Enable the Cloudflare Images binding and remote-image allow-list

**Files:**
- Modify: `wrangler.jsonc:4-8` (insert `images` binding after the `assets` block)
- Modify: `astro.config.mjs:6-10`

**Interfaces:**
- Produces: `astro:assets`' `getImage()`/`<Image>` now resolve through the real Cloudflare Workers image transform for local assets. Remote URLs on the two R2 hostnames become eligible for `getImage()` in Task 3+.

- [ ] **Step 1: Add the `images` binding to `wrangler.jsonc`**

```jsonc
{
  "name": "devlab-studios",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": true
  },
  "images": {
    "binding": "IMAGES"
  },
  "d1_databases": [
```
(Insert the `images` block once, at the top level — not inside `env.preview`.)

- [ ] **Step 2: Switch the adapter's image service and allow-list the R2 hosts**

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev' },
      { protocol: 'https', hostname: 'pub-2450236b7cbf4d68aa4bc07f9b606e29.r2.dev' },
    ],
  },
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  vite: {
    ssr: {
      noExternal: ['react-helmet-async', 'react-router-dom', 'react-router', 'lucide-react', 'clsx'],
    },
  },
})
```

- [ ] **Step 3: Build and verify the binding is picked up**

Run: `npm run build`
Expected: build log includes a line like `[@astrojs/cloudflare] ... IMAGES` (adapter announces bound resources the same way it already logs `Enabling sessions with Cloudflare KV`). No build errors.

- [ ] **Step 4: Verify the homepage's existing `<Image>` usages are now actually transformed**

Run: `npm run build && npm run preview -- --port 4173` (leave running), then in another terminal:
```bash
curl -sI "http://localhost:4173/_image?href=/_astro/data.<hash>.png&f=webp&w=200" | grep -i content-type
```
(Get the real hashed filename from `dist/client/_astro/` first — `ls dist/client/_astro | grep -i data`.)
Expected: `content-type: image/webp` — confirms the transform endpoint is live, not passthrough (a passthrough response would echo the original `image/png`).

- [ ] **Step 5: Re-run the budget test for home**

Run: `npx playwright test image-weight --project=static -g "^/ keeps"`
Expected: still likely FAIL or borderline — the homepage's 3 vector `<Image>` calls will shrink, but this task alone doesn't touch portfolio/cert images. Record the new byte count; it should be visibly lower than Task 1's baseline. Full green comes after Task 4/6.

- [ ] **Step 6: Commit**

```bash
git add wrangler.jsonc astro.config.mjs
git commit -m "perf: enable Cloudflare Images binding instead of passthrough image service"
```

---

### Task 3: Build the shared image-optimization helper and `<picture>` component

**Files:**
- Create: `src/lib/images/optimizeImage.ts`
- Create: `src/components/ResponsivePicture.jsx`

**Interfaces:**
- Produces: `optimizeImage(source, options): Promise<OptimizedPicture | null>` and `<ResponsivePicture image={OptimizedPicture} alt={string} className={string} loading={string} />` — every later task consumes exactly these two.
- `OptimizedPicture` shape: `{ src: string, width: number, height: number, avifSrcSet: string, webpSrcSet: string, sizes: string }`.

- [ ] **Step 1: Write the optimizer**

```typescript
// src/lib/images/optimizeImage.ts
import { getImage } from 'astro:assets'
import type { ImageMetadata } from 'astro'

export interface OptimizedPicture {
  src: string
  width: number
  height: number
  avifSrcSet: string
  webpSrcSet: string
  sizes: string
}

export interface OptimizeImageOptions {
  width: number
  height: number
  fit?: 'cover' | 'contain'
  sizes?: string
}

/**
 * Builds AVIF+WebP srcsets at fixed target dimensions via the Cloudflare
 * Images binding (see astro.config.mjs). Fixed width/height (not
 * `inferSize`) means this never fetches the source image itself — it only
 * builds a `/_image?...` URL — so calling this from an SSR content loader
 * adds no per-request network cost. The actual transform happens lazily,
 * on the browser's first request for that URL, and is cached immutably
 * after that (see @astrojs/cloudflare's image-transform-endpoint).
 */
export async function optimizeImage(
  source: ImageMetadata | string | undefined,
  { width, height, fit = 'cover', sizes = `${width}px` }: OptimizeImageOptions,
): Promise<OptimizedPicture | null> {
  if (!source) return null

  const shared = {
    src: source,
    width,
    height,
    fit,
    densities: [1, 2] as const,
    inferSize: false as const,
  }

  const [avif, webp] = await Promise.all([
    getImage({ ...shared, format: 'avif' }),
    getImage({ ...shared, format: 'webp' }),
  ])

  return {
    src: webp.src,
    width: webp.attributes.width as number,
    height: webp.attributes.height as number,
    avifSrcSet: avif.srcSet.attribute,
    webpSrcSet: webp.srcSet.attribute,
    sizes,
  }
}
```

- [ ] **Step 2: Write the picture component**

```jsx
// src/components/ResponsivePicture.jsx
/**
 * @param {{
 *   image: import('../lib/images/optimizeImage').OptimizedPicture | null,
 *   alt: string,
 *   className?: string,
 *   loading?: 'lazy' | 'eager',
 *   onClick?: () => void,
 * }} props
 */
function ResponsivePicture({ image, alt, className, loading = 'lazy', onClick }) {
  if (!image) return null

  return (
    <picture>
      <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
      <source type="image/webp" srcSet={image.webpSrcSet} sizes={image.sizes} />
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={alt}
        className={className}
        loading={loading}
        onClick={onClick}
      />
    </picture>
  )
}

export default ResponsivePicture
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: no new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/images/optimizeImage.ts src/components/ResponsivePicture.jsx
git commit -m "feat: add shared responsive image optimizer and picture component"
```

---

### Task 4: Wire the optimizer into the projects content loader

**Files:**
- Modify: `src/lib/content/projects.ts` (full rewrite of the image-handling portions)

**Interfaces:**
- Consumes: `optimizeImage` from Task 3.
- Produces: `loadProjects(): Promise<ProjectData[]>` where each `ProjectData` now additionally has `optimizedImage: OptimizedPicture | null` and each `galleryImages[i].optimized: OptimizedPicture | null`. `image`/`galleryImages[].url` are kept (as `ImageMetadata | string`, unchanged) purely as the optimizer's input — confirmed via grep that no `.astro` page reads `.image` directly today (`services.astro` only reads `.title`/`.description`/`.type`), so widening its type is safe.

- [ ] **Step 1: Rewrite the loader**

```typescript
// src/lib/content/projects.ts
import { listProjects } from '../../worker/repositories/projects.js'
import { normalizeProjectMedia } from '../media'
import { portfolioItems } from '../../data/portfolio.js'
import { getEnv } from '../env'
import { optimizeImage, type OptimizedPicture } from '../images/optimizeImage'
import type { ImageMetadata } from 'astro'

type ImageSource = ImageMetadata | string | undefined

interface GalleryImage {
  url?: ImageSource
  optimized?: OptimizedPicture | null
  [key: string]: unknown
}

interface ProjectData {
  id: string
  image?: ImageSource
  optimizedImage?: OptimizedPicture | null
  imageUrl?: string
  galleryImages?: GalleryImage[]
  liveUrl?: string
  sourceUrl?: string
  techStack?: string[]
  [key: string]: unknown
}

const normalizedPortfolioItems: ProjectData[] = portfolioItems

function mergeWithStaticImages(projects: ProjectData[]): ProjectData[] {
  const staticById = new Map(normalizedPortfolioItems.map((project) => [project.id, project]))

  return projects.map((project) => {
    const fallback = staticById.get(project.id)
    const apiGallery = Array.isArray(project.galleryImages) ? project.galleryImages.filter((image) => image?.url) : []
    const fallbackGallery = Array.isArray(fallback?.galleryImages) ? fallback.galleryImages : []

    return {
      ...project,
      liveUrl: project.liveUrl || '#',
      sourceUrl: project.sourceUrl || '#',
      techStack: Array.isArray(project.techStack) ? project.techStack : [],
      image: project.imageUrl || apiGallery[0]?.url || fallback?.image,
      galleryImages: apiGallery.length > 0 ? apiGallery : fallbackGallery,
    }
  })
}

const COVER_IMAGE_SIZE = { width: 640, height: 480, fit: 'cover' as const, sizes: '(min-width: 1024px) 480px, 90vw' }
const GALLERY_IMAGE_SIZE = { width: 1200, height: 675, fit: 'cover' as const, sizes: '(min-width: 1024px) 900px, 95vw' }

async function attachOptimizedImages(projects: ProjectData[]): Promise<ProjectData[]> {
  return Promise.all(
    projects.map(async (project) => ({
      ...project,
      optimizedImage: await optimizeImage(project.image, COVER_IMAGE_SIZE),
      galleryImages: await Promise.all(
        (project.galleryImages || []).map(async (image) => ({
          ...image,
          optimized: await optimizeImage(image.url, GALLERY_IMAGE_SIZE),
        })),
      ),
    })),
  )
}

/**
 * Server-side equivalent of the old useProjects() client hook — queries D1
 * directly during render and merges in the static bundled screenshots that
 * D1 doesn't store, instead of shipping static content then re-fetching.
 */
export async function loadProjects(): Promise<ProjectData[]> {
  const env = getEnv()
  if (!env.DB) return attachOptimizedImages(normalizedPortfolioItems)

  try {
    const projects = await listProjects(env.DB)
    if (!projects.length) return attachOptimizedImages(normalizedPortfolioItems)
    return attachOptimizedImages(
      mergeWithStaticImages(projects.map((project: ProjectData) => normalizeProjectMedia(project, env))),
    )
  } catch {
    return attachOptimizedImages(normalizedPortfolioItems)
  }
}
```

- [ ] **Step 2: Update `PortfolioRow.jsx` to render the optimized images**

In `src/components/PortfolioRow.jsx`, add the import:
```javascript
import ResponsivePicture from './ResponsivePicture'
```

Replace the cover `<img>` (currently `src/components/PortfolioRow.jsx:80-85`):
```jsx
          <ResponsivePicture
            image={project.optimizedImage}
            alt={`${project.title} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
```

Replace the expanded gallery main image (currently around line 183-188):
```jsx
                    <ResponsivePicture
                      image={activeGalleryImage.optimized}
                      alt={activeGalleryImage.altText || `${project.title} gallery image ${activeGalleryIndex + 1}`}
                      className="h-[260px] w-full object-cover sm:h-[360px]"
                    />
```

Replace the thumbnail strip image (currently around line 236-240):
```jsx
                      <ResponsivePicture
                        image={image.optimized}
                        alt={image.altText || `${project.title} thumbnail ${index + 1}`}
                        className="h-20 w-full object-cover"
                      />
```

- [ ] **Step 3: Update `PortfolioGallery.jsx`'s `ImageModal` call to pass the optimized descriptor**

In `src/components/islands/PortfolioGallery.jsx`, `selectedImage` is currently a raw gallery-image record. Change the `<ImageModal>` props (currently lines 41-47):
```jsx
      <ImageModal
        image={selectedImage?.optimized || null}
        alt={selectedImage?.altText || 'Portfolio project screenshot'}
        isOpen={Boolean(selectedImage)}
        onClose={() => setSelectedImage(null)}
        caption={selectedImage?.altText || ''}
      />
```

(`ImageModal`'s prop contract changes in Task 6 below — done once, shared by both galleries.)

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/projects.ts src/components/PortfolioRow.jsx src/components/islands/PortfolioGallery.jsx
git commit -m "perf: serve optimized responsive images for portfolio screenshots"
```

---

### Task 5: Wire the optimizer into the profile/certifications content loader

**Files:**
- Modify: `src/lib/content/profile.ts`

**Interfaces:**
- Consumes: `optimizeImage` from Task 3.
- Produces: `CertificationItem` gains `badgeImage: OptimizedPicture | null` alongside the existing `badgeImageUrl` (kept only as optimizer input; confirmed via grep that only `CertificationsGallery.jsx` renders it today).

- [ ] **Step 1: Update the loader**

```typescript
// src/lib/content/profile.ts (additions/changes only — rest of the file unchanged)
import { optimizeImage, type OptimizedPicture } from '../images/optimizeImage'
// ...existing imports (getProfileContent, getStaticProfileContent, getEnv, badge PNG imports)...

export interface CertificationItem {
  id: string
  name: string
  issuer: string
  issuedDate: string
  credentialUrl: string
  badgeImageUrl: string
  badgeImage?: OptimizedPicture | null
  sortOrder: number
}

const BADGE_IMAGE_SIZE = { width: 240, height: 240, fit: 'contain' as const, sizes: '160px' }

function resolveBadgeImages(data: ProfileContentData): ProfileContentData {
  return {
    ...data,
    certifications: (data.certifications || []).map((cert) => ({
      ...cert,
      badgeImageUrl: cert.badgeImageUrl || BADGE_IMAGES[cert.id]?.src || '',
    })),
  }
}

async function attachOptimizedBadges(data: ProfileContentData): Promise<ProfileContentData> {
  return {
    ...data,
    certifications: await Promise.all(
      (data.certifications || []).map(async (cert) => ({
        ...cert,
        badgeImage: await optimizeImage(cert.badgeImageUrl, BADGE_IMAGE_SIZE),
      })),
    ),
  }
}

const staticProfileContent = resolveBadgeImages(getStaticProfileContent() as ProfileContentData)

// ...hasContent() unchanged...

/** Server-side equivalent of the old useProfileContent() client hook. */
export async function loadProfileContent(): Promise<ProfileContentData> {
  const env = getEnv()
  if (!env.DB) return attachOptimizedBadges(staticProfileContent)

  try {
    const data = await getProfileContent(env.DB)
    if (!hasContent(data)) return attachOptimizedBadges(staticProfileContent)
    return attachOptimizedBadges(resolveBadgeImages(data as ProfileContentData))
  } catch {
    return attachOptimizedBadges(staticProfileContent)
  }
}
```

- [ ] **Step 2: Update `CertificationsGallery.jsx`**

In `src/components/islands/CertificationsGallery.jsx`, add the import:
```javascript
import ResponsivePicture from '../ResponsivePicture'
```

Replace the badge `<img>` (currently lines 20-28):
```jsx
            {cert.badgeImage ? (
              <button
                type="button"
                onClick={() => setSelectedCert(cert)}
                className="mx-auto block rounded-lg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                aria-label={`View ${cert.name} certificate full size`}
              >
                <ResponsivePicture
                  image={cert.badgeImage}
                  alt={`${cert.name} certificate`}
                  className="mx-auto h-20 w-auto object-contain"
                />
              </button>
            ) : (
```

Update the `<ImageModal>` call (currently lines 41-47):
```jsx
      <ImageModal
        image={selectedCert?.badgeImage || null}
        alt={selectedCert ? `${selectedCert.name} certificate` : ''}
        caption={selectedCert ? `${selectedCert.name} — ${selectedCert.issuer}` : ''}
        isOpen={Boolean(selectedCert)}
        onClose={() => setSelectedCert(null)}
      />
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/content/profile.ts src/components/islands/CertificationsGallery.jsx
git commit -m "perf: serve optimized responsive images for certification badges"
```

---

### Task 6: Update `ImageModal` for the new descriptor shape

**Files:**
- Modify: `src/components/ImageModal.jsx`

**Interfaces:**
- Consumes: `image: OptimizedPicture | null` (replaces the old `src: string` prop), used by both `PortfolioGallery.jsx` and `CertificationsGallery.jsx` from Tasks 4-5.

- [ ] **Step 1: Update the component**

```jsx
// src/components/ImageModal.jsx
import { useEffect, useRef } from 'react'
import AnimatedIcon from './icons/AnimatedIcon'
import { X } from './icons/icons'
import ResponsivePicture from './ResponsivePicture'

/**
 * ImageModal Component
 * Accessible lightbox/modal for displaying enlarged images
 *
 * @param {{
 *   image: import('../lib/images/optimizeImage').OptimizedPicture | null,
 *   alt: string,
 *   isOpen: boolean,
 *   onClose: () => void,
 *   caption?: string,
 * }} props
 */
function ImageModal({ image, alt, isOpen, onClose, caption }) {
  const modalRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  const handleBackdropClick = (e) => {
    if (modalRef.current && e.target === modalRef.current) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-modal-title"
    >
      <div className="relative max-h-[90vh] max-w-[95vw] animate-[fadeInScale_0.3s_ease-out]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg bg-white/15 p-2 backdrop-blur-lg transition-all hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 focus-visible:ring-offset-2"
          aria-label="Close image modal"
        >
          <AnimatedIcon icon={X} size={20} color="text-white" animationType="none" ariaLabel={null} />
        </button>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-3 shadow-xl backdrop-blur-lg sm:p-4">
          <ResponsivePicture
            image={image}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
          />

          {caption && (
            <p id="image-modal-title" className="mt-3 text-center text-sm text-slate-200/80">
              {caption}
            </p>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-slate-300/60">Press ESC or click outside to close</p>
      </div>
    </div>
  )
}

export default ImageModal
```

Note: `ResponsivePicture`'s `<img>` doesn't forward `onClick`/backdrop-stop-propagation the same way the old raw `<img>` did (`onClick={(e) => e.stopPropagation()}`) — the modal's own `handleBackdropClick` already only fires when the click target is the backdrop `div` itself (`e.target === modalRef.current`), and the picture/img sits inside the padded inner `div`, so a click on the image never equals `modalRef.current` in the first place. No behavior change; the explicit `stopPropagation` was redundant given that check.

- [ ] **Step 2: Run the full component through the app manually**

Run: `npm run dev`, open `/profile`, click a certification badge and a portfolio screenshot, confirm the lightbox opens with a sharp (not blurry/upscaled) image and ESC/backdrop-click still close it.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageModal.jsx
git commit -m "refactor: ImageModal renders optimized picture descriptors"
```

---

### Task 7: Confirm the budget test goes green, tune thresholds

**Files:**
- Modify: `tests/e2e/image-weight.spec.js` (threshold tuning only, if needed)

**Interfaces:**
- None new — this task closes the loop opened in Task 1.

- [ ] **Step 1: Run the budget test**

Run: `npm run build && npx playwright test image-weight --project=static`
Expected: both `/` and `/profile` PASS now.

- [ ] **Step 2: If either still fails, tighten or loosen based on real numbers, not guesses**

Read the actual failure diff Playwright prints (`Expected: < N`, `Received: M`). If `M` is close to the budget, adjust `IMAGE_BUDGETS_KB` in `tests/e2e/image-weight.spec.js` to `Math.ceil(M / 1024) + 20` KB headroom — the goal is a regression guard, not a hair-trigger.

- [ ] **Step 3: Commit (only if thresholds changed)**

```bash
git add tests/e2e/image-weight.spec.js
git commit -m "test: tune image-weight budgets to measured post-optimization sizes"
```

---

### Task 7.5 (supplemental, added after Task 7's review): Optimize the profile photo

**Why this task exists:** Task 7's review measured `/profile` at 2111KB post-optimization — down 54% from the pre-fix 4623.86KB, but still far above a tight budget. Investigation found `src/components/PersonalInfoCard.jsx:3` imports `src/assets/recent-photo.png` (~473KB built) and renders it as a plain `<img>`, bypassing the `optimizeImage()`/`<ResponsivePicture>` pipeline Tasks 3-6 built entirely. This image was never in Task 4 or Task 5's file scope, despite being named explicitly in the original `docs/performance/PERFORMANCE_FINDINGS.md` audit this plan was based on — a genuine gap in the plan, not a defect in any task's execution. The human partner chose to fix it now rather than defer it.

`PersonalInfoCard.jsx` is rendered from `src/pages/profile.astro` with no `client:` directive (confirmed: `<PersonalInfoCard aboutData={aboutData} />`), meaning it's SSR-only with zero client JS — there's no `client:visible`-style hydration boundary blocking a server-side `getImage()` call the way there was for the portfolio/certification islands. The fix follows the exact same pattern as Tasks 4/5: optimize at the `.astro` page level (where `getImage()` is callable), pass the result down as a prop.

The photo displays as a circular avatar at `h-28`/`sm:h-36`/`lg:h-40` (112px/144px/160px) via `rounded-full object-cover`. A single fixed target size covering the largest display size at 2x density is enough — no responsive `sizes` variation needed since the display size only changes at Tailwind breakpoints, not per-viewport continuously.

**Files:**
- Modify: `src/pages/profile.astro`
- Modify: `src/components/PersonalInfoCard.jsx`
- Modify: `tests/e2e/image-weight.spec.js` (re-tune the `/profile` budget down once the photo is optimized)

**Interfaces:**
- Consumes: `optimizeImage` from `src/lib/images/optimizeImage.ts` (Task 3), `ResponsivePicture` from `src/components/ResponsivePicture.jsx` (Task 3).
- Produces: `PersonalInfoCard` accepts a new `photo: OptimizedPicture | null` prop instead of importing the asset itself.

- [ ] **Step 1: Optimize the photo in `profile.astro`**

Add the import and a call to `optimizeImage`, then pass the result down:

```astro
---
import Layout from '../layouts/Layout.astro'
import SectionHeader from '../components/SectionHeader.jsx'
import PersonalInfoCard from '../components/PersonalInfoCard.jsx'
// ...existing imports...
import { optimizeImage } from '../lib/images/optimizeImage'
import profilePhoto from '../assets/recent-photo.png'

const seo = await loadPageSeo('profile')
const profileContent = await loadProfileContent()
const projects = await loadProjects()
const aboutData = profileContent.about || {}
const experiences = profileContent.experiences || []
const certifications = profileContent.certifications || []
const optimizedPhoto = await optimizeImage(profilePhoto, { width: 320, height: 320, fit: 'cover', sizes: '160px' })
---
```

Update the `<PersonalInfoCard>` usage (currently `<PersonalInfoCard aboutData={aboutData} />`) to:

```astro
    <PersonalInfoCard aboutData={aboutData} photo={optimizedPhoto} />
```

- [ ] **Step 2: Update `PersonalInfoCard.jsx` to render via `ResponsivePicture`**

```jsx
import AnimatedIcon from './icons/AnimatedIcon'
import { MapPin, Mail } from './icons/icons'
import ResponsivePicture from './ResponsivePicture'

/**
 * @param {{
 *   aboutData: Record<string, unknown>,
 *   photo: import('../lib/images/optimizeImage').OptimizedPicture | null,
 * }} props
 */
function PersonalInfoCard({ aboutData, photo }) {
  return (
    <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 text-center lg:flex-row lg:text-left">
        <div className="flex justify-center lg:justify-center lg:self-center">
          <div className="group relative">
            <ResponsivePicture
              image={photo}
              alt="Profile photo of Stephen Rey G. Agustinez"
              className="h-28 w-28 rounded-full border-2 border-brand-orange/25 object-cover shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:border-brand-orange/45 sm:h-36 sm:w-36 lg:h-40 lg:w-40"
            />
            <div className="absolute inset-0 rounded-full bg-brand-teal/0 transition-all duration-300 group-hover:bg-brand-teal/10 group-hover:blur-xl" />
          </div>
        </div>
        {/* ...rest of the component is unchanged... */}
```

Everything below the photo (the name/location/email block) stays exactly as it is today — only the photo `<img>` and the component's props/imports change.

- [ ] **Step 3: Verify and measure**

Run: `npm run build && npx playwright test image-weight --project=static`
Expected: `/profile` drops further below its current 2111KB measurement (the built `recent-photo.png` was 473KB raw; expect a substantial drop once it's served as a small, correctly-sized AVIF/WebP instead). Note the new measured number.

- [ ] **Step 4: Re-tune the `/profile` budget down**

In `tests/e2e/image-weight.spec.js`, update `IMAGE_BUDGETS_KB['/profile']` to `Math.ceil(new_measured_KB) + 20`, replacing the 2132 value Task 7 set. Re-run the test to confirm it passes at the new, tighter number.

- [ ] **Step 5: Commit**

```bash
git add src/pages/profile.astro src/components/PersonalInfoCard.jsx tests/e2e/image-weight.spec.js
git commit -m "perf: serve optimized responsive image for profile photo"
```

---

### Task 8: Cheap, independent CLS fix — Footer logo dimensions

**Files:**
- Modify: `src/components/Footer.astro:25-31`

**Interfaces:** None — self-contained.

- [ ] **Step 1: Add explicit width/height**

```astro
        <img
          id="footer-logo"
          src={brandingAssets.logoSideUrl}
          alt="DevLab Studios"
          class="mb-3 h-12 w-auto object-contain"
          loading="lazy"
          width="160"
          height="48"
        />
```
(160×48 matches the rendered `h-12` (48px) height at the logo's real aspect ratio — check `src/assets/devlabstudios-logo.png`'s dimensions if the visual proportion looks off after this change, and adjust the `width` value only, since `height` is what Tailwind's `h-12` actually constrains.)

- [ ] **Step 2: Visual check**

Run: `npm run dev`, load any page, confirm the footer logo isn't stretched/squashed.

- [ ] **Step 3: Commit**

```bash
git add src/components/Footer.astro
git commit -m "fix: reserve footer logo dimensions to prevent layout shift"
```

---

### Task 9: Reduce Safari/mobile compositing cost

**Files:**
- Modify: `src/layouts/Layout.astro:85-89`
- Modify: `src/index.css:32-53`

**Interfaces:** None — self-contained, purely visual/perf.

- [ ] **Step 1: Cut decorative blur layers from 3 to 2, shrink radii**

In `src/layouts/Layout.astro`, replace:
```astro
      <div class="pointer-events-none absolute inset-0 overflow-hidden">
        <div class="absolute left-1/3 top-20 h-64 w-64 rounded-full bg-brand-teal/10 blur-[140px]"></div>
        <div class="absolute right-1/4 top-48 h-80 w-80 rounded-full bg-brand-orange/10 blur-[160px]"></div>
        <div class="absolute bottom-20 left-10 h-48 w-48 rounded-full bg-fuchsia-200/25 blur-[130px]"></div>
      </div>
```
with:
```astro
      <div class="pointer-events-none absolute inset-0 overflow-hidden">
        <div class="absolute left-1/3 top-20 h-64 w-64 rounded-full bg-brand-teal/10 blur-[80px]"></div>
        <div class="absolute right-1/4 top-48 h-80 w-80 rounded-full bg-brand-orange/10 blur-[90px]"></div>
      </div>
```
(GPU/CPU filter cost scales roughly with blur radius squared — halving the two largest radii and dropping the third layer entirely meaningfully cuts compositing work on weaker mobile GPUs, particularly Safari's, while keeping the same soft-glow visual language.)

- [ ] **Step 2: Stop pinning the decorative dot-grid texture during scroll**

In `src/index.css`, change:
```css
body::before,
body::after {
  content: '';
  position: fixed;
```
to:
```css
body::before,
body::after {
  content: '';
  position: absolute;
```
(`body` already has `position: relative` at `src/index.css:28`, so `absolute` positions these the same way visually on initial load — the only change is that they now scroll with the page instead of forcing a fixed compositing layer that Safari must repaint on every scroll frame. This is a purely decorative background texture; scrolling with the page is not visually noticeable and is strictly cheaper.)

- [ ] **Step 3: Visual + scroll check**

Run: `npm run dev`, open the homepage on a throttled/mobile emulation profile in DevTools (or a real device), scroll the full page, confirm no visible jank regression and the decorative elements still look correct.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/Layout.astro src/index.css
git commit -m "perf: reduce blur compositing cost and stop pinning decorative background during scroll"
```

---

### Task 10: Cross-platform verification — WebKit coverage + refreshed baseline

**Files:**
- Modify: `playwright.config.js`
- Create: `docs/performance/baseline-2026-08-04/README.md` (+ Lighthouse report files alongside it)

**Interfaces:** None new — this is the plan's acceptance gate.

- [ ] **Step 1: Install the WebKit browser binary**

Run: `npx playwright install webkit`

- [ ] **Step 2: Add Desktop Safari and Mobile Safari projects**

In `playwright.config.js`, add two projects alongside the existing `static`/`worker` ones:
```javascript
    {
      name: 'desktop-safari',
      testMatch: /(public-pages|contact-form|image-weight)\.spec\.js/,
      use: { baseURL: 'http://localhost:4173', ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-safari',
      testMatch: /(public-pages|contact-form|image-weight)\.spec\.js/,
      use: { baseURL: 'http://localhost:4173', ...devices['iPhone 14'] },
    },
```
And update the import at the top of the file:
```javascript
import { defineConfig, devices } from '@playwright/test'
```
(already imported — just confirm `devices` is in scope for the new projects, which it is since it's a top-level config import.)

- [ ] **Step 3: Run the full suite across all engines**

Run: `npx playwright test --project=static --project=desktop-safari --project=mobile-safari`
Expected: PASS on all three. This is the first time this repo's public pages are actually exercised on WebKit (the engine backing Safari) instead of only Chromium — fix any WebKit-specific failures that surface (most likely candidates: CSS features used without a fallback, or timing-sensitive test assertions written against Chromium's paint timing).

- [ ] **Step 4: Capture a fresh Lighthouse baseline for comparison**

Run (mirroring the methodology in `docs/performance/baseline-2026-07-31/README.md`):
```bash
npm run build && npm run preview -- --port 4173
npx lighthouse http://localhost:4173/ --output html --output json --output-path docs/performance/baseline-2026-08-04/home.report --preset=perf
npx lighthouse http://localhost:4173/profile --output html --output json --output-path docs/performance/baseline-2026-08-04/profile.report --preset=perf
npx lighthouse http://localhost:4173/insights --output html --output json --output-path docs/performance/baseline-2026-08-04/resources.report --preset=perf
```

- [ ] **Step 5: Write the comparison README**

```markdown
# Performance/Accessibility Baseline — 2026-08-04

Captured the same way as `../baseline-2026-07-31/README.md`, after enabling the Cloudflare Images binding, wiring optimized `<picture>` markup through the portfolio/certification islands, and reducing Safari compositing cost (see `docs/superpowers/plans/2026-08-04-cross-platform-performance.md`).

| Page | Performance (before → after) | LCP (before → after) | CLS (before → after) | Total weight (before → after) |
|---|---|---|---|---|
| `/` (Home) | 73 → _fill in_ | 3.7s → _fill in_ | 0.237 → _fill in_ | 583 KiB → _fill in_ |
| `/profile` | 57 → _fill in_ | 5.4s → _fill in_ | 0.236 → _fill in_ | 862 KiB → _fill in_ |
| `/resources` | 77 → _fill in_ | 2.9s → _fill in_ | 0.236 → _fill in_ | 382 KiB → _fill in_ |

Raw reports: `home.report.{html,json}`, `profile.report.{html,json}`, `resources.report.{html,json}`.
```
Fill in the `_fill in_` cells with the actual numbers from Step 4's reports before committing.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.js docs/performance/baseline-2026-08-04/
git commit -m "test: add WebKit/Mobile Safari coverage and refreshed performance baseline"
```

---

### Task 10.5 (supplemental, added after Task 10's review): Fix certification badge optimization

**Why this task exists:** Task 10's cross-browser/Lighthouse pass caught that Task 5's certification-badge optimization (reviewed clean at the time) never actually works. Confirmed independently by the controller by inspecting rendered output: a badge's `<picture>` `avifSrcSet`/`webpSrcSet`/fallback `src` all resolve to the exact same raw `/_astro/*.png` path — no `/_image?...` transform query at all, unlike the profile photo (Task 7.5) and project screenshots (Task 4), which both correctly produce real transform URLs.

**Root cause:** `src/lib/content/profile.ts`'s `resolveBadgeImages` (existing code, written in Task 5) immediately collapses each local badge import to a plain `.src` string via `BADGE_IMAGES[cert.id]?.src`, then stores that string as `badgeImageUrl`. `attachOptimizedBadges` passes `cert.badgeImageUrl` into `optimizeImage()` — but by then the original `ImageMetadata` object (the thing Astro's image service actually needs to locate and re-transform a local asset) is already gone; a bare already-built `/_astro/hash.png` string doesn't carry enough information for the transform pipeline to act on, so `getImage()` just returns it unchanged. This is the exact same failure mode Task 4 avoided for project images (by never unwrapping `ImageMetadata` early) — Task 5's brief incorrectly asserted a bare string was fine here. It isn't, for the local-fallback badges specifically (D1-stored badge URLs, which are genuine remote strings, were never affected by this bug and need no change).

**Files:**
- Modify: `src/lib/content/profile.ts`

**Interfaces:**
- No change to `CertificationItem`'s public shape beyond one new internal field (`badgeSource`) used only inside this file to carry the richer reference from `resolveBadgeImages` to `attachOptimizedBadges`.

- [ ] **Step 1: Rewrite the badge-resolution and optimization functions**

```typescript
// src/lib/content/profile.ts
import { getProfileContent } from '../../worker/repositories/content.js'
import { getStaticProfileContent } from '../../data/profileContent.js'
import { getEnv } from '../env'
import { optimizeImage, type OptimizedPicture } from '../images/optimizeImage'
import type { ImageMetadata } from 'astro'
import zapierBadge from '../../assets/certificates/Zapier_Certificate.png'
import makeBadge from '../../assets/certificates/Make_Certificate.png'
import n8nBadge from '../../assets/certificates/N8N_Certificate.png'
import highLevelBadge from '../../assets/certificates/HighLevelCertificate.png'

const BADGE_IMAGES: Record<string, ImageMetadata> = {
  'cert-zapier-no-code-automation': zapierBadge,
  'cert-make-no-code-automation': makeBadge,
  'cert-n8n-ai-automation': n8nBadge,
  'cert-highlevel-crm': highLevelBadge,
}

// ...AboutData, ExperienceItem interfaces unchanged...

export interface CertificationItem {
  id: string
  name: string
  issuer: string
  issuedDate: string
  credentialUrl: string
  badgeImageUrl: string
  badgeSource?: ImageMetadata | string
  badgeImage?: OptimizedPicture | null
  sortOrder: number
}

// ...ProfileContentData unchanged...

const BADGE_IMAGE_SIZE = { width: 240, height: 240, fit: 'contain' as const, sizes: '160px' }

function resolveBadgeImages(data: ProfileContentData): ProfileContentData {
  return {
    ...data,
    certifications: (data.certifications || []).map((cert) => {
      const localBadge = BADGE_IMAGES[cert.id]
      return {
        ...cert,
        badgeImageUrl: cert.badgeImageUrl || localBadge?.src || '',
        badgeSource: cert.badgeImageUrl || localBadge,
      }
    }),
  }
}

async function attachOptimizedBadges(data: ProfileContentData): Promise<ProfileContentData> {
  return {
    ...data,
    certifications: await Promise.all(
      (data.certifications || []).map(async (cert) => ({
        ...cert,
        badgeImage: await optimizeImage(cert.badgeSource, BADGE_IMAGE_SIZE),
      })),
    ),
  }
}

// ...staticProfileContent, hasContent, loadProfileContent all unchanged — they already call
// resolveBadgeImages then attachOptimizedBadges in the right order on every return path...
```

The only behavioral change: `resolveBadgeImages` now also stamps a `badgeSource` field carrying either the real D1 URL string (if `cert.badgeImageUrl` was already set from live data) or the original `ImageMetadata` object (if falling back to a local badge) — and `attachOptimizedBadges` reads `cert.badgeSource` instead of `cert.badgeImageUrl` when calling `optimizeImage()`. `badgeImageUrl` itself is untouched and still populated the same way, since nothing else depends on `badgeSource` existing.

- [ ] **Step 2: Verify the transform actually runs**

Run: `npm run build && npm run preview -- --port 4173`, then fetch `/profile` and confirm a certification badge's rendered `src`/`avifSrcSet`/`webpSrcSet` now contain a real `/_image?href=...&w=...&h=...&f=...` URL, not a raw `/_astro/*.png` path (the same check the controller used to first confirm this bug — grep the HTML for `badgeImage` and inspect the `src` field).

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 4: Re-measure and re-tighten the `/profile` budget**

Run: `npx playwright test image-weight --project=static`
Expected: `/profile`'s measured bytes drop meaningfully below the current 1642.18KB (Task 7.5's number) now that ~1.3MB of raw badge PNGs are actually being transformed. Update `IMAGE_BUDGETS_KB['/profile']` in `tests/e2e/image-weight.spec.js` to `Math.ceil(new_measured_KB) + 20`, replacing 1663. Re-run to confirm it passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/profile.ts tests/e2e/image-weight.spec.js
git commit -m "fix: optimize certification badge images (Task 5 regression found in Task 10)"
```

---

## Self-Review Notes

- **Coverage check:** every finding from the original audit (passthrough image service, missing width/height causing CLS, GPU-heavy blur/backdrop-filter, no WebKit test coverage) maps to a task above.
- **Scoped out, deliberately:** the zone-level `cdn-cgi/image` proxy path was considered for remote R2 images and rejected — it requires Cloudflare zone-level Image Resizing to be enabled on the account, which can't be verified from the repo, whereas the Workers `images` binding (Task 2) works identically in local Miniflare, preview, and production without any account-level toggle. If `images` binding availability turns out to be gated on this account's plan, that would surface immediately in Task 2 Step 3/4 as a build or runtime error, before any downstream task depends on it.
- **Deliberately not done:** storing real image width/height in the `project_gallery_images` D1 table. The fixed-target-size approach (Task 4/5) sidesteps needing that data at all, avoiding a migration for a problem the crop-to-fixed-size design already solves.
