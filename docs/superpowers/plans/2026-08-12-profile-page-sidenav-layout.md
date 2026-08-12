# Profile Page Side-Nav Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the entire Profile page into one continuous sidebar + document-flow layout, add a scrollspy + cursor-glow sidebar nav, remove now-redundant per-section headings, nest Achievements & Responsibilities under Education, widen the Portfolio carousel to match the Tools marquee's width, and add dot pagination with an active-pill indicator — per `docs/superpowers/specs/2026-08-12-profile-page-sidenav-layout-design.md`.

**Architecture:** Four tasks, mostly sequential. Task 1 (layout restructure + heading removal + Achievements nesting + font sizing) rewrites the bulk of `profile.astro` and must land first, since it creates the section `id`s Task 2's nav targets. Task 2 (sidebar nav) depends on Task 1. Tasks 3 (Portfolio width) and 4 (Portfolio dots) both touch `PortfolioGallery.jsx` but at non-overlapping parts of it and don't depend on Tasks 1-2 — do them last, in either order.

**Tech Stack:** Astro 7, React 19 islands, Tailwind CSS 3.4, vanilla-JS `IntersectionObserver` (matching the existing `scrollReveal.ts` pattern — no new React islands for the nav's interactivity).

## Global Constraints

- `.jsx`/`.ts` files: JSDoc prop types / TypeScript types matching this repo's existing convention.
- Immutability: spread-based state updates, never mutate in place.
- No `console.log` in committed code.
- Commit format: conventional commits, type must be one of [build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test].
- Verify every task with `npm run typecheck && npm run build`. Use `npm run build && npm run preview -- --port 4173` for visual/interaction verification, then **stop the preview server before finishing** — don't leave `node.exe` processes running (this has bitten a prior task in this same plan series; check with `tasklist //FI "IMAGENAME eq node.exe"` before reporting done if you started a preview server).
- No data-model, D1, or admin CMS changes — every task here is layout/composition/styling.
- **Verified facts from reading the actual current files (do not re-derive):**
  - `brand-teal` = `#7a00ff`, `brand-orange` = `#1a16ff`, `brand-ink` = `#121739` (from `tailwind.config.js`'s `theme.extend.colors.brand`). Use these exact hex values in any plain-CSS (non-Tailwind-class) rule that needs them, since Tailwind's arbitrary-value/theme-color utilities aren't usable inside a `.css` file's own selectors.
  - `PersonalInfoCard.jsx` has no `client:*` directive today (Astro renders it to static HTML) — this plan keeps it that way. All new nav interactivity is a vanilla-JS module invoked from a `<script>` tag directly in `profile.astro` (mirroring `Layout.astro`'s own `initScrollReveal()` invocation), not a React state/hydration change.
  - `PortfolioGallery.jsx`'s carousel structure today (post the previous round's final-review fix) is: `.portfolio-carousel-outer` (outer `relative` div, currently `mx-auto mt-6 max-w-[900px]`) containing `.portfolio-carousel-wrap` (the masked, Embla-ref'd inner div) and the two arrow `<button>`s as its siblings. The `max-w-[900px]` lives on the **outer** div, not the wrap.
  - `.tools-marquee-wrap` (in `src/index.css`) has no `max-width` of its own — it fills whatever width its parent gives it. Matching Portfolio's width to it means removing Portfolio's own cap, not adding anything to the marquee.
  - `src/lib/scrollReveal.ts`'s `initScrollReveal()` is invoked from a `<script>` tag inside `Layout.astro`, positioned right after the page's main content wrapper `<div>`. This plan's new `profileSideNav.ts` script follows the identical placement pattern, but inside `profile.astro` itself (not `Layout.astro`), since this nav only exists on this one page.

## File Structure

| File | Responsibility |
|---|---|
| `src/pages/profile.astro` | Whole-page layout restructure (Task 1), new `<script>` invocation for the side nav (Task 2) |
| `src/components/PersonalInfoCard.jsx` | Adds the nav `<nav>` markup beneath existing sidebar content (Task 2) |
| `src/lib/profileSideNav.ts` (new) | Scrollspy `IntersectionObserver` + cursor-glow `mousemove` handler (Task 2) |
| `src/index.css` | Nav dash/glow styling (Task 2), Portfolio dot styling if needed (Task 4) |
| `src/components/islands/PortfolioGallery.jsx` | Remove width cap (Task 3), add dot pagination (Task 4) |

---

## Task 1: Layout restructure, remove per-section headings, nest Achievements, font sizing

**Files:**
- Modify: `src/pages/profile.astro`

**Interfaces:**
- Produces: six `<section id="...">` elements (`about`, `education`, `certifications`, `experience`, `tools`, `portfolio`) inside the right column — Task 2's nav links target these exact ids.

- [ ] **Step 1: Read the current file in full**

Confirm `profile.astro` still matches the structure described in this plan's Global Constraints and the design spec's "Current State" section before editing — this plan was written against a specific snapshot.

- [ ] **Step 2: Replace the entire `<Layout>` body**

Replace everything between `<Layout title="Profile — DevLab Studios" seo={seo}>` and `</Layout>` with:

```astro
  <div class="space-y-10">
    <SectionHeader
      title="Profile"
      subtitle="Founder background, technical experience, and selected website and automation projects."
    />

    <div class="grid gap-10 lg:grid-cols-[280px_1fr] lg:items-start">
      <div class="lg:sticky lg:top-24">
        <PersonalInfoCard aboutData={aboutData} photo={optimizedPhoto} />
      </div>

      <div class="space-y-12 lg:border-l lg:border-slate-200 lg:pl-10">
        <section id="about">
          <p class="text-base leading-relaxed text-slate-700 sm:text-lg">{aboutData.about}</p>
        </section>

        <section id="education" class="border-t border-slate-200 pt-8">
          <ul class="space-y-4">
            {(aboutData.education || []).map((item) => (
              <li>
                <p class="font-semibold text-brand-ink">{item.program}</p>
                <p class="text-slate-700">{item.school}</p>
                <p class="text-sm text-slate-500">{item.years}</p>
              </li>
            ))}
          </ul>

          {(aboutData.achievementsAndResponsibilities || []).length > 0 ? (
            <div class="mt-6">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">Achievements & Responsibilities</p>
              <ul class="mt-3 space-y-4">
                {(aboutData.achievementsAndResponsibilities || []).map((item) => (
                  <li>
                    <p class="font-semibold text-brand-ink">{item.title}</p>
                    <p class="text-slate-700">{item.details}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section id="certifications" class="border-t border-slate-200 pt-8">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">Professional</p>
          <ul class="mt-3 space-y-4">
            {(aboutData.certificatesAndLicenses || []).map((cert) => (
              <li class="flex items-start gap-3">
                <CertificationLogo issuer={cert.issuer} />
                <div>
                  <p class="text-sm text-brand-ink">{cert.name}</p>
                  {cert.date ? <p class="text-xs text-slate-500">{cert.date}</p> : null}
                </div>
              </li>
            ))}
          </ul>

          {certifications.length > 0 ? (
            <div class="mt-6">
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">Platform Training</p>
              <div class="mt-3">
                <CertificationsGallery client:visible certifications={certifications} />
              </div>
            </div>
          ) : null}
        </section>

        <section id="experience" class="border-t border-slate-200 pt-8">
          <ExperienceTimeline client:visible experiences={experiences} />
        </section>

        <section id="tools" class="border-t border-slate-200 pt-8">
          <ToolsMarquee tools={coreTools} />
        </section>

        <section id="portfolio" class="space-y-6 border-t border-slate-200 pt-8">
          <PortfolioGallery client:visible projects={projects} />
        </section>
      </div>
    </div>
  </div>

  <script>
    import { initProfileSideNav } from '../lib/profileSideNav'
    initProfileSideNav()
  </script>
```

Note what changed versus the current file: the `<SectionHeader>` calls for Experience/Tools & Platforms/Portfolio are gone; the standalone `<h3>` labels for About/Education/Certifications are gone; Achievements & Responsibilities is now nested inside `id="education"` (with its own small-caps sub-label) instead of being a sibling section; the About paragraph gained `text-base ... sm:text-lg leading-relaxed`; every section that isn't the first (`about`) keeps the `border-t border-slate-200 pt-8` divider it already had (Experience/Tools/Portfolio didn't have this divider before since they were separate full-width sections — they now need it, since they're inside the same continuous right column as everything else). The `<script>` block at the end doesn't do anything yet — `src/lib/profileSideNav.ts` doesn't exist until Task 2; this task will fail to build until Task 2 lands. **Do not skip ahead and stub the file** — see Step 3.

- [ ] **Step 3: Create a temporary no-op `src/lib/profileSideNav.ts` so this task can build and be verified independently**

```typescript
/**
 * Placeholder — Task 2 of this plan implements the real scrollspy +
 * cursor-glow behavior here. This task only needs the import to resolve.
 */
export function initProfileSideNav(): void {}
```

(Task 2 will replace this file's contents entirely with the real implementation — this is not a permanent stub, it exists so Task 1 is independently verifiable and committable per this plan's task-per-commit convention.)

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`. Confirm: About/Education/Certifications/Experience/Tools & Platforms/Portfolio all render in one continuous right-hand column, in that order, with no repeated section titles anywhere in the content column (only the page-level "Profile" heading at the very top). Achievements & Responsibilities appears directly under Education's list, with its own small-caps sub-label. The sidebar (photo/name/status/location/email) stays sticky through the entire scroll, not just through the first few sections. Stop the preview server when done.

- [ ] **Step 6: Commit**

```bash
git add src/pages/profile.astro src/lib/profileSideNav.ts
git commit -m "feat: restructure Profile into one continuous sidebar + document-flow layout"
```

---

## Task 2: Sidebar nav — scrollspy + cursor-glow

**Files:**
- Modify: `src/lib/profileSideNav.ts` (replace the Task 1 placeholder entirely)
- Modify: `src/components/PersonalInfoCard.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: the six `<section id="...">` elements Task 1 created (`about`, `education`, `certifications`, `experience`, `tools`, `portfolio`).
- Produces: `initProfileSideNav(): void`, called once from `profile.astro`'s `<script>` tag (already wired in Task 1).

- [ ] **Step 1: Read `src/lib/scrollReveal.ts` and its invocation in `Layout.astro`**

This is the pattern to follow: a small, focused vanilla-JS module exporting one init function, invoked once from a `<script>` tag. Confirm you understand why it works without any React involvement before writing the new module.

- [ ] **Step 2: Replace `src/lib/profileSideNav.ts`'s contents**

```typescript
const SCROLLSPY_ROOT_MARGIN = '-45% 0px -50% 0px'

/**
 * Wires up the Profile page's sidebar nav: an IntersectionObserver-driven
 * scrollspy that toggles `.is-active` on whichever nav link corresponds to
 * the section currently in the vertical middle of the viewport, and a
 * cursor-following spotlight glow that's purely decorative and independent
 * of scroll position. Both read from `[data-profile-side-nav]`, the nav
 * element `PersonalInfoCard.jsx` renders.
 */
export function initProfileSideNav(): void {
  const nav = document.querySelector<HTMLElement>('[data-profile-side-nav]')
  if (!nav) return

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
  if (links.length === 0) return

  const sections = links
    .map((link) => document.getElementById(link.getAttribute('href')!.slice(1)))
    .filter((section): section is HTMLElement => section !== null)

  if (sections.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const activeId = entry.target.id
          links.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === `#${activeId}`)
          })
        })
      },
      { rootMargin: SCROLLSPY_ROOT_MARGIN },
    )
    sections.forEach((section) => observer.observe(section))
  }

  nav.addEventListener('mousemove', (event) => {
    const rect = nav.getBoundingClientRect()
    nav.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
    nav.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
    nav.style.setProperty('--spot-opacity', '1')
  })

  nav.addEventListener('mouseleave', () => {
    nav.style.setProperty('--spot-opacity', '0')
  })
}
```

- [ ] **Step 3: Add the nav markup to `PersonalInfoCard.jsx`**

Read the current file first — it ends with a `</section>` closing the sidebar's contact-meta block. Add the new nav as a sibling immediately before that closing `</section>`:

```jsx
      <nav data-profile-side-nav className="profile-side-nav relative mt-6 hidden w-full lg:block">
        <div className="profile-side-nav-glow" aria-hidden="true" />
        <a href="#about" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">About</a>
        <a href="#education" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Education</a>
        <a href="#certifications" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Certifications</a>
        <a href="#experience" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Experience</a>
        <a href="#tools" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Tools &amp; Platforms</a>
        <a href="#portfolio" className="profile-side-nav-link text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Portfolio</a>
      </nav>
```

(`hidden lg:block`: this nav only makes sense at the `lg` breakpoint where the sidebar is sticky and persistently visible alongside scrolling content — below `lg` the layout stacks into one column and a jump-nav above all the actual content would just push everything down without the sticky benefit that makes it useful. This mirrors the existing responsive convention already on this page, where `lg:sticky lg:top-24` is itself conditional on the same breakpoint.)

- [ ] **Step 4: Add the nav + glow CSS to `src/index.css`**

Add near the other component-specific rules (e.g. after the `.cert-shine` rules):

```css
.profile-side-nav {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 4px 0;
}

.profile-side-nav-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(160px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(122, 0, 255, 0.12), transparent 70%);
  opacity: var(--spot-opacity, 0);
  transition: opacity 0.3s ease;
}

.profile-side-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  transition: color 0.25s ease;
}

.profile-side-nav-link::before {
  content: '';
  width: 24px;
  height: 1px;
  background: currentColor;
  opacity: 0.5;
  flex-shrink: 0;
  transition: width 0.25s ease, opacity 0.25s ease;
}

.profile-side-nav-link.is-active {
  color: #7a00ff;
}

.profile-side-nav-link.is-active::before {
  width: 40px;
  opacity: 1;
}
```

(`#7a00ff` is `brand-teal`'s exact hex from `tailwind.config.js` — plain CSS rules can't reference Tailwind's theme colors directly, so this is the correct way to stay consistent with the rest of the page's color palette. `rgba(122, 0, 255, 0.12)` in the glow is that same color at low opacity.)

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 6: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile` at a desktop width (≥1024px, so the `lg:` nav is visible). Confirm: scrolling through the page highlights each nav item in turn as its section reaches roughly the middle of the viewport (About → Education → Certifications → Experience → Tools & Platforms → Portfolio), the highlighted item's dash grows and turns purple; moving the mouse over the nav area shows a soft glow following the cursor, independent of which item is scroll-active; clicking any nav link jumps to that section. At a mobile width (<1024px), confirm the nav does not render (per the `hidden lg:block` decision) and nothing else about the mobile layout is disturbed. Stop the preview server when done.

- [ ] **Step 7: Commit**

```bash
git add src/lib/profileSideNav.ts src/components/PersonalInfoCard.jsx src/index.css
git commit -m "feat: add scrollspy + cursor-glow navigation to the Profile sidebar"
```

---

## Task 3: Portfolio carousel width matches the Tools marquee

**Files:**
- Modify: `src/components/islands/PortfolioGallery.jsx`

**Interfaces:** None — no prop/behavior changes, className only.

- [ ] **Step 1: Read the current carousel markup**

Confirm `.portfolio-carousel-outer`'s className is still exactly `"portfolio-carousel-outer relative mx-auto mt-6 max-w-[900px]"` before editing (this is the outer div, not `.portfolio-carousel-wrap` — the previous round's final-review fix moved the arrows out to this outer div, so the width cap now lives here).

- [ ] **Step 2: Remove the width cap**

Change:

```jsx
      <div className="portfolio-carousel-outer relative mx-auto mt-6 max-w-[900px]">
```

to:

```jsx
      <div className="portfolio-carousel-outer relative mt-6">
```

(Dropping both `mx-auto` and `max-w-[900px]` — centering only matters when the element is narrower than its parent; once it fills the full column width like `.tools-marquee-wrap` does, `mx-auto` has nothing to do.)

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Portfolio. Confirm the carousel now fills the same width as the Tools & Platforms marquee above it (both edges align), more cards are visible/peeking than before at wide viewports (an expected, accepted side effect — not a bug), autoplay/hover-pause/manual arrows/category tabs all still work, and the edge fade from the previous round still reads correctly at the new width. Stop the preview server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/PortfolioGallery.jsx
git commit -m "fix: widen the Portfolio carousel to match the Tools & Platforms marquee"
```

---

## Task 4: Portfolio dot pagination with an active pill

**Files:**
- Modify: `src/components/islands/PortfolioGallery.jsx`

**Interfaces:** None — reuses the existing `filteredItems`/`selectedIndex`/`emblaApi` state already present in this component; no new state, no prop changes.

- [ ] **Step 1: Read the current component's state**

Confirm `selectedIndex` (set via the existing `onSelect` callback, subscribed to Embla's `select`/`reInit` events) and `filteredItems` are still present and named exactly that before editing.

- [ ] **Step 2: Add the dot row**

Find the closing `</div>` of `.portfolio-carousel-outer` (right after the two arrow `<button>`s, right before `<ProjectDetailModal`). Add this new block immediately after that closing `</div>`:

```jsx
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {filteredItems.map((project, index) => (
          <button
            key={project.id}
            type="button"
            onClick={() => emblaApi?.scrollTo(index)}
            aria-label={`Go to ${project.title}`}
            aria-current={index === selectedIndex}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === selectedIndex ? 'w-6 bg-brand-teal' : 'w-2 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
```

This is deliberately always rendered (no hover-only opacity like the arrows) — its purpose is showing position, which only works if it's always visible. The active dot renders as a `w-6` pill (wider, `bg-brand-teal`) instead of the resting `w-2` round dot (`bg-slate-300`).

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Portfolio. Confirm: a row of dots renders below the carousel (always visible, not hover-gated), the dot matching the currently-centered project renders as a wider pill, clicking any dot jumps the carousel to that project (works the same for both category tabs — switch categories and confirm the dot count changes to match and the active pill resets to index 0), and the dot row doesn't visually clash with or overlap the arrow buttons above it. Stop the preview server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/PortfolioGallery.jsx
git commit -m "feat: add dot pagination with an active-pill indicator to the Portfolio carousel"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (layout restructure) + §3 (heading removal) + §4 (Achievements nesting) + §7 (font sizing) → Task 1 (the spec's own implementation notes group these together since they all touch the same file region). §2 (sidebar nav) → Task 2. §5 (Portfolio width) → Task 3. §6 (Portfolio dots) → Task 4.
- **Type/interface consistency:** Task 1 creates a temporary no-op `profileSideNav.ts` solely so it's independently buildable/committable; Task 2 replaces its entire contents with the real implementation and both export the same `initProfileSideNav(): void` signature, so `profile.astro`'s `<script>` block (written once, in Task 1) never needs to change.
- **No placeholders:** every task's code blocks are complete and copy-pasteable. The one intentional "placeholder" (Task 1's no-op `profileSideNav.ts`) is explicitly flagged as temporary-by-design with the exact task that replaces it named, not an unresolved TBD.
