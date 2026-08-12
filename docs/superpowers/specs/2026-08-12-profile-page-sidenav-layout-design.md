# Profile Page Side-Nav Layout — Design Spec

## Goal

Third follow-up round on the Profile page. Restructures the *entire* page into one continuous sidebar + document-flow layout (currently only About/Education/Certifications live inside that grid — Experience, Tools & Platforms, and Portfolio are separate full-width sections below it), adds a scrollspy + cursor-glow navigation list to the sidebar (directed by brittanychiang.com), removes now-redundant per-section headings, nests Achievements & Responsibilities under Education, widens the Portfolio carousel to match the Tools marquee's width, adds dot pagination to the carousel (closing a gap from the original 2026-08-06 spec that was never implemented), and tunes font sizing for the flattened hierarchy.

This spec was validated interactively via the brainstorming visual-companion tool for the one genuinely visual, ambiguous decision (what "pointer highlight" meant) — two mockups were shown and the cursor-following spotlight glow was chosen over a per-item hover highlight.

## Current State

- **Layout:** `src/pages/profile.astro` wraps only About/Education/Certifications/Achievements in a `grid lg:grid-cols-[280px_1fr]` with a sticky left column (`PersonalInfoCard`). Experience, Tools & Platforms, and Portfolio are separate full-width `<section>`s below that grid, each with its own `<SectionHeader title=... subtitle=... />`.
- **Sidebar:** `PersonalInfoCard.jsx` — photo, name, title, availability pill, a hairline-bordered location/email block. Static (Astro-rendered, no `client:*` directive) — no interactivity today.
- **Section headings:** About/Education/Certifications use small inline `<h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">` labels (no subtitle). Experience/Tools & Platforms/Portfolio use the bigger `<SectionHeader>` component (title + descriptive subtitle).
- **Achievements & Responsibilities:** its own top-level section inside the sidebar grid, sibling to Education/Certifications, not nested under either.
- **Portfolio carousel:** `.portfolio-carousel-wrap` in `PortfolioGallery.jsx` is capped at `max-w-[900px] mx-auto`, narrower than the uncapped `ToolsMarquee`'s `tools-marquee-wrap`. No dot pagination exists — only prev/next arrow buttons (hover-only visibility).
- **Scroll-reveal:** `src/lib/scrollReveal.ts`, a shared vanilla-JS `IntersectionObserver` invoked once from `Layout.astro`, watches `[data-reveal]` elements site-wide. This is the established pattern for scroll-driven behavior on this site — no React state involved.

## Component Designs

### 1. Whole-page sidebar + document-flow layout

**Modified:** `src/pages/profile.astro`

The existing `grid lg:grid-cols-[280px_1fr] lg:items-start` wrapper (currently only around About/Education/Certifications/Achievements) is extended to wrap the *entire* page body below the page-level "Profile" header. The right column becomes one continuous flow, in this order:

1. **About** — `id="about"`, paragraph only, no heading (see §3).
2. **Education** — `id="education"`, the existing education list, with **Achievements & Responsibilities nested directly beneath it** (§4) — no longer a sibling top-level section.
3. **Certifications** — `id="certifications"`, the existing "Professional" + "Platform Training" sub-groups, unchanged internally.
4. **Experience** — `id="experience"`, `<ExperienceTimeline client:visible experiences={experiences} />`, unchanged internally.
5. **Tools & Platforms** — `id="tools"`, `<ToolsMarquee tools={coreTools} />`, unchanged internally.
6. **Portfolio** — `id="portfolio"`, `<PortfolioGallery client:visible projects={projects} />`, widened (§5) and with dot pagination (§6).

The left column keeps `lg:sticky lg:top-24` exactly as it does today — this works identically regardless of how tall the right column grows, since sticky positioning only cares about the container's height relative to the viewport, not its absolute size. `PersonalInfoCard` also now renders the new nav list (§2) beneath its existing photo/name/contact content, still with no `client:*` directive — it stays fully static; all new interactivity is driven by a page-level `<script>`, matching the `scrollReveal.ts` pattern.

Divider convention: each of the 6 sections keeps the existing `border-t border-slate-200 pt-8` (except the first, About) for visual separation, since there are no headings to provide that separation anymore.

### 2. Sidebar nav — scrollspy + cursor-glow

**New file:** `src/lib/profileSideNav.ts` (vanilla JS, invoked once from a `<script>` tag in `profile.astro` itself — not `Layout.astro`, since this nav only exists on this one page)
**Modified:** `src/components/PersonalInfoCard.jsx` (adds the nav markup)
**Modified:** `src/index.css` (nav + glow styling)

Nav list, in section order: About, Education, Certifications, Experience, Tools & Platforms, Portfolio (6 items — Achievements & Responsibilities is not a separate nav entry, per §4). Each item is a plain `<a href="#<id>">` with a leading dash + label, styled with the same small-caps convention already used elsewhere on this page (`text-xs font-semibold uppercase tracking-[0.16em]`), muted (`text-slate-500`) at rest.

Two independent behaviors, both driven by `profileSideNav.ts`, both vanilla DOM APIs (no React, matching this site's established scroll-reveal pattern):

- **Scrollspy:** one `IntersectionObserver` watching all 6 `<section id="...">` elements, with `rootMargin` tuned so whichever section occupies the vertical middle of the viewport is considered "current" (the standard scrollspy technique — e.g. `rootMargin: '-45% 0px -50% 0px'`). On change, toggle an `.is-active` class on the nav link whose `href` matches that section's `id`, and remove it from all others. `.is-active` brightens the text color to `brand-teal` and lengthens the leading dash — a persistent, position-based indicator, independent of the mouse.
- **Cursor-glow:** a `mousemove` listener on the nav's wrapper element positions a soft radial-gradient glow (an absolutely-positioned `div`, `pointer-events: none`) at the cursor's coordinates relative to that wrapper, via CSS custom properties (`--spot-x`, `--spot-y`) read by the glow's `background`/`transform`. A `mouseleave` listener fades it to `opacity: 0`. This is purely decorative hover feedback, layered on top of (not replacing) the scrollspy's `.is-active` state — chosen over a per-item hover highlight after reviewing both as live mockups.

Clicking any nav link still performs a normal anchor-scroll to its section (native browser behavior, no JS needed for that part).

### 3. Remove redundant per-section headings

**Modified:** `src/pages/profile.astro`

Delete the `<SectionHeader title=... subtitle=... />` calls currently on Experience, Tools & Platforms, and Portfolio, and delete the small `<h3>` top-level labels currently on About, Education, and Certifications ("Achievements & Responsibilities" is handled separately in §4). The nav (§2) is now the only place these six section names appear. Sub-group labels that disambiguate content *within* a section — "Professional" / "Platform Training" under Certifications — are **not** removed; they aren't redundant with the nav, since the nav only names the section, not its internal sub-groups.

The page-level `<SectionHeader title="Profile" subtitle="Founder background, technical experience, and selected website and automation projects." />` at the very top of the page is unaffected — that's the page's own overview heading (consistent with every other page on this site), not a per-section heading.

### 4. Achievements & Responsibilities nests under Education

**Modified:** `src/pages/profile.astro`

Move the Achievements & Responsibilities block to render directly beneath the Education list, inside the same `id="education"` section (education entries were completed during the same college years the achievements were earned — the site owner's stated reasoning). Add a small-caps sub-label above it, matching the exact convention already used for "Professional"/"Platform Training" under Certifications: `text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal`, reading "Achievements & Responsibilities". This keeps a consistent sub-group-labeling pattern across both merged sections rather than inventing a second convention.

### 5. Portfolio carousel width matches the Tools marquee

**Modified:** `src/components/islands/PortfolioGallery.jsx`

Remove `max-w-[900px] mx-auto` from `.portfolio-carousel-wrap`'s className, so it fills the same full column width as `.tools-marquee-wrap` (which has no max-width of its own — it simply fills whatever width its parent gives it). Both now live in the same right-column width, so no extra CSS is needed to force them to match — removing the cap is sufficient. A natural, accepted side effect: more cards will be visible/peeking at the wider width than today (Embla's `align: 'center'` computes visible slide count from the container width automatically — no change needed to that logic).

### 6. Portfolio dot pagination with an active pill

**Modified:** `src/components/islands/PortfolioGallery.jsx`

Add a row of dot buttons below the carousel — one per project in the currently-filtered category (up to 13 for Automation, 5 for Website; `flex flex-wrap` handles any overflow gracefully, though neither count is expected to wrap at normal widths). Unlike the prev/next arrows (which stay hover-only, since they're navigation controls), the dots are **always visible** — their whole purpose is showing position, which only works if they're always there. The dot for the currently-selected slide (`selectedIndex`, already tracked in this component's state — see the existing `onSelect` callback) renders as an elongated pill (wider, colored) instead of a small round dot. Clicking a dot calls `emblaApi.scrollTo(index)`. This closes a gap from the original 2026-08-06 redesign spec, which specified dot navigation but it was never implemented.

### 7. Font sizing for the flattened hierarchy

**Modified:** `src/pages/profile.astro`, `src/components/PersonalInfoCard.jsx`

With per-section headings gone (§3), a few sizes need deliberate adjustment rather than being left to whatever the heading removal happens to leave behind:

- **About paragraph:** bumped from the current plain `text-slate-700` (Tailwind default ~16px) to `text-base sm:text-lg leading-relaxed`, since it's now the page's lead paragraph with nothing above it — needs to read as an intentional opening statement, not a fragment.
- **Nav links (§2):** reuse the exact existing small-caps convention (`text-xs font-semibold uppercase tracking-[0.16em]`) already used for the About/Education/Certifications labels being removed — this is the same visual weight those labels had, just relocated to the sidebar, so no new type scale is introduced.
- **Achievements sub-label (§4):** matches the existing `text-[11px]` sub-label convention already used for "Professional"/"Platform Training" — see §4.
- **Everything else** (Education/Certification entry text, Experience card internals, Tools/Portfolio component internals) is unchanged — those were never wrapped in a now-removed heading and are already sensibly scaled.

## Data Flow

No data-model, D1, or admin CMS changes. Every change in this round is layout/composition/styling — section ordering, where headings do or don't appear, carousel width, and a new client-side nav script that reads section positions and mouse coordinates, not application data.

## Error Handling

- Scrollspy: if `IntersectionObserver` support is ever absent (not a real concern for this site's supported-browser matrix), the nav simply never gains an `.is-active` class — links remain fully functional as plain anchors regardless.
- Dot pagination: reuses the existing `filteredItems`/`selectedIndex` state already present in `PortfolioGallery.jsx` — no new failure mode, mirrors the existing arrow buttons' reliance on `emblaApi`.

## Testing

Same convention as the prior three rounds: `npm run typecheck && npm run build` after every task; `npm run build && npm run preview` for visual/interaction verification (scrollspy actually activates the right nav item at each section, the cursor-glow follows the mouse, dot pagination advances the carousel and shows the active pill, the sticky sidebar holds through the full page height, not just the first grid); throwaway Playwright specs (deleted after passing) for anything needing real browser confirmation. Re-run `tests/e2e/image-weight.spec.js` unmodified — no images added/removed.

## Non-Goals

- No color/theme changes.
- No data-model or D1 schema changes.
- No changes to Embla carousel mechanics (autoplay, category-tab re-init, `--center-scale`, windowed image loading) beyond the width cap removal and the additive dot row.
- No conversion of `PersonalInfoCard` (or any other component) into a client-hydrated React island — the new nav's interactivity is a vanilla-JS module, matching this site's established scroll-reveal pattern.
- No renaming of the "Tools & Platforms" section — the nav uses that exact existing title, not the shorthand "Tools & Platform" used in casual conversation about this spec.

## Implementation Notes for the Plan

Roughly ordered by dependency: the layout restructure (§1) and heading removal (§3) touch the same file and should land together as one task, since §3's removals are only meaningful once §1's new section wrapper/id structure exists. The sidebar nav (§2) depends on §1's section `id`s existing. Achievements nesting (§4) is a sub-piece of §1's restructure, not independent. Font sizing (§7) touches the same edited regions as §1/§3/§4, so it's cheapest to fold into that same task rather than a separate pass. Portfolio width (§5) and dot pagination (§6) are independent of everything else and of each other's file (both touch `PortfolioGallery.jsx`, but at different, non-overlapping parts of it) — could be one task or two.
