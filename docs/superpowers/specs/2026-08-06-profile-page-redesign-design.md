# Profile Page Redesign — Design Spec

## Goal

Make the Profile page (`src/pages/profile.astro`) feel more visually appealing and modern for a wider (not purely technical) audience, through five focused visual/interaction upgrades: a real-logo tools marquee, hero card polish, certification hover polish, a redesigned experience timeline, and an auto-rotating portfolio carousel. All motion respects `prefers-reduced-motion`, consistent with the site's existing global CSS rule (`src/index.css:30-34` collapses all `animation`/`transition` durations to near-zero under reduced motion).

This spec was validated interactively via the brainstorming visual-companion tool — every layout/animation decision below was demonstrated as a live, functioning mockup and approved before being written down here, not just described.

## Current State (what exists today)

- **Tools**: `src/data/tools.js` — 14 tools, each `{ key, label, icon }` where `icon` is a generic Lucide icon name (e.g. Zapier → `Zap`, Make → `Settings`, GoHighLevel → `Briefcase`) — no real brand logos anywhere in the codebase. Rendered inside `SystemsPanel.jsx`'s "Core Tools In Use" sub-panel as a small icon+label list, one of three sub-panels (alongside Workflow Patterns and System Characteristics) crammed into one card.
- **Hero**: `PersonalInfoCard.jsx` — static card, photo + name/role/location/email, no entrance animation, no status indicator.
- **Certifications**: `CertificationsGallery.jsx` — a 2/4-column grid of badge thumbnails (`ResponsivePicture`, already using the optimized-image pipeline from the earlier performance work), click opens `ImageModal` at full size. Issuer/date always visible as small text below the thumbnail.
- **Experience**: inline in `profile.astro` (lines ~97-131) — full-width stacked cards, one per role, title/role/company/dates/bullets, no visual timeline structure, no scroll animation.
- **Portfolio**: `PortfolioGallery.jsx` (category tabs Automation/Website + list) → `PortfolioRow.jsx` per project (cover image, click-to-expand inline gallery with prev/next + thumbnail strip, tech stack pills, live/source links) → `ImageModal.jsx` for full-size gallery images. This is a lot of already-working functionality that the new carousel design must not silently drop.

## Architecture Overview

Five independent, separately-shippable pieces sharing one new cross-cutting utility (scroll-reveal). Nothing here changes the data-loading layer (`loadProjects()`, `loadProfileContent()`) — all five pieces consume data that's already loaded and optimized by the existing pipeline; this is a presentation-layer redesign only.

```
profile.astro
├── PersonalInfoCard.jsx        (modified: entrance animation, glow ring, status pill)
├── ToolsMarquee.jsx             (NEW: standalone section, replaces SystemsPanel's tool sub-panel)
├── SystemsPanel.jsx            (modified: Core Tools sub-panel removed)
├── [Experience section]        (rewritten inline in profile.astro: left-rail timeline)
├── CertificationsGallery.jsx   (modified: hover polish only, structure unchanged)
└── PortfolioGallery.jsx        (rewritten: category tabs + Embla carousel + detail modal)
    ├── PortfolioCard.jsx        (NEW: single carousel slide — cover image + title, replaces PortfolioRow's list-row role)
    └── ProjectDetailModal.jsx   (NEW: opened on card click — gallery nav + description + tech stack + links, replacing PortfolioRow's inline expand)

src/lib/scrollReveal.ts          (NEW: shared IntersectionObserver utility, used by Experience rows and other scroll-in sections)
```

## Component Designs

### 1. Tools & Platforms Marquee

**New files:**
- `src/components/ui/ToolsMarquee.jsx`
- `src/assets/tool-logos/*.svg` (vendored local logo files — see Asset Sourcing below)

**Modified:**
- `src/data/tools.js` — each entry gains a `logo` field (import path to the local SVG), `icon` stays as a fallback for any future tool added without a logo yet.
- `src/components/ui/SystemsPanel.jsx` — remove the "Core Tools In Use" `<section>` (lines 42-58 in the current file) and its now-unused `featuredTools`/`moreToolsCount` locals; Workflow Patterns and System Characteristics sections are untouched. The `tools` prop is dropped from `SystemsPanel`'s signature.
- `src/pages/profile.astro` — add a new full-width `<section>` with `<SectionHeader title="Tools & Platforms" .../>` + `<ToolsMarquee tools={...} />`, placed as its own section (not nested inside the Systems & Workflows panel).

**Behavior (validated in the browser mockup):**
- Two rows, alternating scroll direction: row 1 animates via `dir-right` (moves toward increasing X), row 2 via `dir-left` (moves toward decreasing X) — exactly as approved in the mockup.
- Each row's content is duplicated once (`[...tools, ...tools]`) and the CSS animation translates by exactly `-50%`, so the loop point is invisible — the same technique validated live in the mockup.
- Logos render grayscale + 55% opacity by default (`filter: grayscale(1) opacity(0.55)`); on hovering the row, filter is removed (full color) and the row's animation is paused (`animation-play-state: paused`) — both scoped via a single `:hover` rule on the wrapping element, no JS needed.
- Edge fade via `mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent)` (plus `-webkit-mask-image` for Safari).
- `prefers-reduced-motion`: no special-case code needed — this is a pure CSS `animation`, already covered by the existing global rule in `index.css`.

**Asset sourcing:**
- Tools with a Simple Icons entry (confirmed candidates: React, Tailwind CSS, Cloudflare, Zapier, n8n, GitHub, OpenAI, Notion, Airtable, Google Workspace, Astro) — download each as a local SVG at build/dev time (not a runtime CDN fetch — the mockup used `cdn.simpleicons.org` for quick preview only; production vendors these as files under `src/assets/tool-logos/`, consistent with every other image in this codebase going through local imports + the optimization pipeline established in the earlier performance work).
- Make.com and GoHighLevel have no Simple Icons entry — source their logo directly from each brand's official press/media kit page (per your explicit choice) and save as local SVG/PNG under the same folder.
- Logos are simple brand marks — no `optimizeImage()`/`ResponsivePicture` needed (that pipeline exists for photographic/screenshot raster images; SVGs are already tiny and vector). Rendered as plain `<img>` with explicit `width`/`height` to avoid CLS, matching the site's established CLS-prevention pattern from the mobile audit.

### 2. Hero Card Polish

**Modified:** `src/components/PersonalInfoCard.jsx`

- Entrance animation: the card's root `<section>` gets a mount-triggered fade+slide-up, reusing the existing `fadeInScale` keyframe already defined in `src/styles/animations.css` (used today by `ImageModal.jsx`) rather than inventing a new one.
- Animated glow ring: extend the existing decorative `<div className="absolute inset-0 rounded-full bg-brand-teal/0 ...">` (line 22 today, currently only a hover effect) with a second, always-on subtle pulsing ring behind the photo, using the existing `pulse-soft` keyframe (already in `animations.css`, already used by `ServiceGraphic.jsx`) — no new keyframes required for this piece either.
- Status pill: add a `<span className="badge-pill">Available for part-time and full-time engagements</span>` below the name/role block — reusing the exact `.badge-pill` class already defined in `src/index.css:74-82` and already used on the Home page hero (`src/pages/index.astro`), not a new component or style.

### 3. Certifications Hover Polish

**Modified:** `src/components/islands/CertificationsGallery.jsx`

- Card hover: add `transition hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(60,28,120,0.20)]` to the per-cert `<div>` (line 20 today).
- Shine sweep: a `::after` pseudo-element (diagonal gradient, `translateX(-100%)` at rest → `translateX(100%)` on hover, matching the well-known "card shine" CSS technique) added via a small Tailwind arbitrary-value class or a 4-line addition to `index.css`.
- Issuer/date reveal: the issuer (`cert.issuer`) and formatted date currently render as always-visible text (lines 40-41). Change to an overlay that's `opacity-0` at rest and `group-hover:opacity-100`, positioned over the badge image area — cert name (`cert.name`) stays always-visible below, since that's the primary label.
- No structural/data changes — `badgeImage`/`badgeImageFull` and the `ImageModal` integration are untouched.

### 4. Experience Timeline

**Modified:** `src/pages/profile.astro` (Experience section, currently lines ~97-131)

**New shared utility:** `src/lib/scrollReveal.ts` — a small client-side script (loaded once, e.g. via a `<script>` tag in `Layout.astro` or the Experience section itself) that runs one `IntersectionObserver` watching every `[data-reveal]` element on the page, adding a `.reveal-visible` class (with an optional `data-reveal-delay` attribute read for per-item stagger, driven via inline `transition-delay`) the first time each element enters the viewport, then unobserving it. One observer instance, reused by the Experience timeline now and available to Portfolio/other sections later — not duplicated per component.

- `.reveal` / `.reveal-visible` CSS added to `index.css`: `opacity:0; transform: translateY(28px) scale(0.98); transition: opacity 0.7s cubic-bezier(.22,1,.36,1), transform 0.7s cubic-bezier(.22,1,.36,1);` at rest, `opacity:1; transform:none;` when `.reveal-visible` is added — matching the exact easing/timing validated in the mockup. Already covered by the global reduced-motion rule (transition duration collapses to ~0, element still ends up fully visible since the class is still added).
- Layout, left to right: year badge (gradient pill, e.g. `2024` / `Present`) → dot-on-a-continuous-vertical-line (line drawn via a `::before` on the row container, positioned via CSS Grid so it lines up across every row) → the existing role/company/bullets card content (unchanged content, new wrapper). Each row is a grid: `grid-template-columns: auto auto 1fr`.
- Each row carries `data-reveal` and a `data-reveal-delay` computed from its index (`{index * 90}ms`) for the staggered entrance validated in the mockup.

### 5. Portfolio Carousel

**New dependencies:** `embla-carousel-react`, `embla-carousel-autoplay`

**New files:**
- `src/components/islands/PortfolioCard.jsx` — one carousel slide: cover image (`ResponsivePicture`) + title, click opens the detail modal. Replaces the "collapsed row" visual role `PortfolioRow.jsx` currently plays.
- `src/components/ProjectDetailModal.jsx` — opened on card click. Contains: the project's gallery images with prev/next navigation and a thumbnail strip (this is the part of `PortfolioRow.jsx`'s current expanded state — lines 173-266 today — that gets moved here essentially as-is), description, tech stack pills, live/source links. Clicking the large image still opens the existing `ImageModal.jsx` for a full-size view, exactly like today.

**Modified:**
- `src/components/islands/PortfolioGallery.jsx` — keeps its category-tab state (`CATEGORIES`, `filteredItems` — unchanged) and `ImageModal` wiring, but replaces the `<div className="mt-6 space-y-6">{filteredItems.map(...PortfolioRow...)}</div>` list with an Embla carousel of `PortfolioCard`s built from `filteredItems`. Switching category re-initializes the carousel against the new filtered set (Embla's `reInit()` API, called from a `useEffect` keyed on `category`).
- `src/components/PortfolioRow.jsx` — retired; its expanded-state JSX becomes `ProjectDetailModal.jsx`, its collapsed-cover-click role becomes `PortfolioCard.jsx`. (Confirming removal, not just leaving dead code, per this project's existing no-dead-code convention.)

**Behavior (validated in the browser mockup, now mapped to Embla's real API):**
- `embla-carousel-autoplay` configured with `stopOnMouseEnter: true` (pauses the whole carousel on hover — the plugin's built-in behavior, replacing the mockup's hand-rolled `mouseenter`/`mouseleave` handlers) and a continuous scroll direction matching the mockup's speed.
- Center-focus scale/opacity/blur: a `useEffect` subscribing to Embla's `scroll`/`reInit` events, computing each slide's distance from the current snap point via `emblaApi.scrollProgress()` + `emblaApi.snapList()` + `emblaApi.slideNodes()`, and applying the same formula validated in the mockup (`opacity = 1 - normalized*0.6`, `blur = normalized*3px`, `scale = 1 - normalized*0.1`) as inline styles per slide — same math, now driven by Embla's real scroll engine instead of a hand-rolled `requestAnimationFrame` + `scrollLeft` loop.
- Manual prev/next arrows call `emblaApi.scrollPrev()` / `emblaApi.scrollNext()`; dots call `emblaApi.scrollTo(index)` — both only rendered/enabled while the autoplay plugin reports itself stopped (i.e., while hovered), matching the mockup's "controls appear on hover" behavior.
- Card size: ~360px wide, wrapper capped so ~2.5-3 cards are visible with neighbors partially peeking in on both sides (confirmed against real-world carousel UX research: this is the right pattern for "browse a collection," as opposed to a single-large-hero pattern which is for spotlighting one flagship item — not appropriate for a 16-project portfolio).
- **Accessibility exception to the reduced-motion default:** unlike the marquee/scroll-reveal (which inherit the existing blanket CSS rule for free), the carousel's autoplay is *continuous, indefinite* motion — qualitatively different from a one-time reveal. `embla-carousel-autoplay` is explicitly not started (or immediately stopped) when `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is true, checked once on mount. Manual prev/next/dot navigation remains fully available either way.

## Data Flow

No changes to `loadProjects()` (`src/lib/content/projects.ts`) or `loadProfileContent()` (`src/lib/content/profile.ts`) — both already return everything the new components need (`optimizedImage`, `galleryImages[].optimized`, `badgeImage`/`badgeImageFull`, etc., all from the earlier performance work). `src/data/tools.js` gains a `logo` field but keeps its existing shape/export otherwise, so nothing else that imports it breaks.

## Error Handling

- Tool logos: if a logo asset is missing/fails to load, fall back to the tool's existing generic `icon` (Lucide) rather than a broken image — mirrors the existing fallback pattern already used for the navbar logo (`Navbar.astro`'s `data-fallback-src` + `onerror` handler).
- Carousel: if a filtered category has zero projects (shouldn't happen with current data, but matches this codebase's defensive style elsewhere), render the existing empty-state pattern rather than mounting an empty Embla instance.
- Everything else (certifications, hero, timeline) has no new failure modes beyond what already exists — no new data fetching, just new presentation of existing, already-validated data.

## Testing

- Extend `tests/e2e/public-pages.spec.js` (or a new `tests/e2e/profile-page.spec.js`) to cover: marquee renders with real logo `<img>` tags (not broken/missing), certifications hover reveal works, timeline rows reach `.reveal-visible`, portfolio carousel responds to hover (pause) and manual arrow/dot clicks, and the detail modal opens with gallery/tech-stack/links content matching what `PortfolioRow` used to show inline.
- Reduced-motion check: `page.emulateMedia({ reducedMotion: 'reduce' })` — assert the carousel's autoplay does not advance over a short wait, while marquee/timeline/hero content still ends up fully visible (opacity 1) even though transitions are instant.
- Cross-browser: run the new/changed spec across all three existing Playwright projects (`static`, `desktop-safari`, `mobile-safari`) — this page previously had zero WebKit-specific coverage beyond the generic page-load checks.
- Image-weight budget: `tests/e2e/image-weight.spec.js`'s `/profile` budget (currently 174KB) will need re-measuring once the new logo assets land — SVGs are typically tiny, but this must be verified, not assumed, the same way every image change in the earlier performance work was.

## Out of Scope

- No changes to the underlying content/data model (D1 schema, `loadProjects`/`loadProfileContent`) — this is presentation-only.
- No changes to other pages (Home, Services, etc.) — the marquee/timeline/carousel patterns are scoped to Profile only for now, even though they could be reused elsewhere later.
- Real logo files for Make.com/GoHighLevel are sourced during implementation, not pre-selected in this spec — the implementation plan will include a task to source and vendor them.

## Implementation Notes for the Plan

This spec covers five genuinely independent pieces sharing one small utility (`scrollReveal.ts`). The implementation plan (next step) should decompose these into separately-shippable, separately-reviewable tasks — similar in spirit to the earlier performance-optimization plan's task structure — rather than one monolithic change, since each piece (marquee, hero, certifications, timeline, carousel) touches different files with no interdependency except the shared reveal utility.
