# Profile Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Profile page more visually appealing for a wider audience via five upgrades — a real-logo tools marquee, hero card polish, certification hover polish, a left-rail experience timeline, and an Embla-based auto-rotating portfolio carousel — all validated as live browser mockups before this plan was written.

**Architecture:** Five independent, separately-shippable presentation-layer changes sharing one new utility (`src/lib/scrollReveal.ts`, a single site-wide `IntersectionObserver`). No changes to data loading (`loadProjects()`, `loadProfileContent()`) — every component consumes data that's already loaded and optimized by the existing pipeline. Full design rationale, and the browser-mockup validation history, is in `docs/superpowers/specs/2026-08-06-profile-page-redesign-design.md` — read it once for context; this plan is the executable breakdown of that spec.

**Tech Stack:** Astro 7 (`output: 'server'`), React 19 islands, Tailwind CSS, `embla-carousel-react` + `embla-carousel-autoplay` (both already installed, see Global Constraints), `simple-icons` (devDependency, source-only — never shipped to the client).

## Global Constraints

- TypeScript files: explicit types on exported functions/interfaces; no `any`. `.jsx` files: JSDoc prop types matching this repo's existing convention (see `ResponsivePicture.jsx`, `ImageModal.jsx`).
- Immutability: spread-based updates, never mutate in place.
- No `console.log` in committed code.
- Commit format: `<type>: <description>` (conventional commits).
- `embla-carousel-react@^8.6.0` and `embla-carousel-autoplay@^8.6.0` are **already installed** (`package.json`/`package-lock.json` already updated) — their exact API was verified directly against the installed packages' `.d.ts` files during planning (not guessed): `useEmblaCarousel(options?, plugins?)` returns `[emblaRef, emblaApi]`; `emblaApi` exposes `scrollNext(jump?)`, `scrollPrev(jump?)`, `scrollTo(index, jump?)`, `scrollProgress()`, `scrollSnapList()`, `selectedScrollSnap()`, `slideNodes()`, `rootNode()`, `reInit(options?, plugins?)`, `on(event, cb)`/`off(event, cb)` (events include `'scroll'`, `'reInit'`, `'select'`, `'init'`). `Autoplay(options)` accepts `{ delay, stopOnMouseEnter, stopOnInteraction, stopOnLastSnap, playOnInit, jump, rootNode }`. Core options include `{ loop, align: 'start'|'center'|'end', dragFree, containScroll, startIndex }`. Do not deviate from these exact names — every other name floating around on the internet for this library (`goToNext`, `snapList()`, `selectedSnap()`) is wrong; the names above were read from `node_modules/embla-carousel/components/EmblaCarousel.d.ts` and `.../Options.d.ts` directly.
- Every step must be verifiable with `npm run build && npm run preview` locally (this project's established pattern — `@astrojs/cloudflare`'s preview runs the real Miniflare/workerd runtime, including D1). Local D1 must be migrated first if a fresh checkout: `npx wrangler d1 migrations apply devlab-studios-cms --local`.
- `prefers-reduced-motion`: this codebase already has a blanket rule (`src/index.css`, the `@media (prefers-reduced-motion: reduce)` block in `src/styles/animations.css`) that collapses all CSS `animation`/`transition` durations to ~0. Pure-CSS motion (marquee, scroll-reveal, hover effects) needs no extra code to respect this. The portfolio carousel's **continuous autoplay** is the one exception — that must be explicitly disabled via JS when reduced motion is preferred (see Task 8), since indefinite motion is qualitatively different from a one-time transition.
- Windows dev note: this worktree's `astro dev` may crash with an unrelated Miniflare/workerd bug seen in earlier sessions — always verify via `npm run build && npm run preview`, not `npm run dev`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/scrollReveal.ts` (new) | One shared `IntersectionObserver` that reveals any `[data-reveal]` element site-wide. |
| `scripts/copy-tool-logos.mjs` (new) | One-time script copying specific SVGs out of the `simple-icons` package into `src/assets/tool-logos/`. |
| `src/assets/tool-logos/*.svg` (new) | Vendored local logo files — no runtime dependency on `simple-icons` or any CDN. |
| `src/data/tools.js` | Gains a `logo` field per tool; splits the combined "Notion / Airtable" entry into two; adds an `astro` entry. |
| `src/components/ui/ToolsMarquee.jsx` (new) | Two-row auto-scrolling logo marquee, alternating direction, grayscale→color + pause on hover. |
| `src/components/ui/SystemsPanel.jsx` | Drops the "Core Tools In Use" sub-panel (now superseded by the marquee) and the `tools` prop. |
| `src/components/PersonalInfoCard.jsx` | Entrance animation, glow ring, "available for work" status pill. |
| `src/components/islands/CertificationsGallery.jsx` | Hover lift + shine sweep + issuer/date reveal-on-hover. |
| `src/pages/profile.astro` | Wires in `ToolsMarquee`; Experience section rewritten as a left-rail timeline using `scrollReveal`. |
| `src/components/PortfolioCard.jsx` (new) | One carousel slide (cover image + title), replacing `PortfolioRow`'s collapsed-row role. |
| `src/components/ProjectDetailModal.jsx` (new) | Opened on card click — gallery nav, description, tech stack, links (moved from `PortfolioRow`'s expanded state). |
| `src/components/islands/PortfolioGallery.jsx` | Category tabs unchanged; list-of-rows replaced with an Embla carousel of `PortfolioCard`s + `ProjectDetailModal`. |
| `src/components/PortfolioRow.jsx` | Deleted once its content has moved into `PortfolioCard`/`ProjectDetailModal`. |

---

### Task 1: Shared scroll-reveal utility

**Files:**
- Create: `src/lib/scrollReveal.ts`
- Modify: `src/index.css` (append `[data-reveal]` rules)
- Modify: `src/layouts/Layout.astro` (wire the script in once, site-wide)

**Interfaces:**
- Produces: `initScrollReveal(): void` — call once per page load. Any element in the DOM with a `data-reveal` attribute becomes hidden until scrolled into view, at which point it fades/slides/scales in over 0.7s. An optional `data-reveal-delay="150"` attribute (milliseconds) staggers individual elements.

- [ ] **Step 1: Write the utility**

```typescript
// src/lib/scrollReveal.ts

/**
 * Reveals every `[data-reveal]` element on the page once it scrolls into
 * view (fade + slide + slight scale, see the `.reveal-visible` CSS rule in
 * index.css). An optional `data-reveal-delay` attribute (milliseconds)
 * staggers a group of elements relative to each other. Elements are
 * unobserved after their first reveal — this never re-hides on scroll-out.
 */
export function initScrollReveal(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-reveal]')
  if (elements.length === 0) return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const target = entry.target as HTMLElement
        const delay = target.getAttribute('data-reveal-delay')
        if (delay) target.style.transitionDelay = `${delay}ms`
        target.classList.add('reveal-visible')
        observer.unobserve(target)
      })
    },
    { threshold: 0.15 },
  )

  elements.forEach((element) => observer.observe(element))
}
```

- [ ] **Step 2: Add the CSS**

Append to `src/index.css` (after the existing `.shadow-faint` rule at the end of the file):

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(28px) scale(0.98);
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

[data-reveal].reveal-visible {
  opacity: 1;
  transform: none;
}
```

- [ ] **Step 3: Wire it into every page**

In `src/layouts/Layout.astro`, find the closing `</body>` tag and add a script immediately before it (this file already has an inline `<script>` for the mobile nav in `Navbar.astro` following the same pattern — this is the site-wide equivalent):

```astro
    <script>
      import { initScrollReveal } from '../lib/scrollReveal'
      initScrollReveal()
    </script>
  </body>
```

- [ ] **Step 4: Verify it fires correctly**

Write a throwaway Playwright check (do not commit this file — it's for your own verification only, delete it in Step 6):

```javascript
// tests/e2e/zzz-scroll-reveal-check-image-weight.spec.js
// (named to match the static project's testMatch pattern — see playwright.config.js)
import { test, expect } from '@playwright/test'

test('data-reveal elements become visible on scroll', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.createElement('div')
      el.setAttribute('data-reveal', '')
      el.textContent = 'reveal test fixture'
      el.style.marginTop = '3000px'
      document.body.appendChild(el)
    })
  })
  await page.goto('/', { waitUntil: 'networkidle' })
  const fixture = page.locator('[data-reveal]', { hasText: 'reveal test fixture' })
  await expect(fixture).toHaveCSS('opacity', '0')
  await fixture.scrollIntoViewIfNeeded()
  await expect(fixture).toHaveClass(/reveal-visible/, { timeout: 2000 })
  await expect(fixture).toHaveCSS('opacity', '1')
})
```

Run: `npm run build && npx playwright test zzz-scroll-reveal --project=static`
Expected: PASS.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 6: Clean up and commit**

```bash
rm tests/e2e/zzz-scroll-reveal-check-image-weight.spec.js
git add src/lib/scrollReveal.ts src/index.css src/layouts/Layout.astro
git commit -m "feat: add shared scroll-reveal utility for entrance animations"
```

---

### Task 2: Source and vendor tool logo assets

**Files:**
- Create: `scripts/copy-tool-logos.mjs`
- Create: `src/assets/tool-logos/*.svg` (generated by the script)
- Modify: `package.json` (adds `simple-icons` devDependency)
- Modify: `src/data/tools.js`

**Interfaces:**
- Produces: `src/assets/tool-logos/<slug>.svg` files, and `coreTools` entries each carrying a `logo` field (an ES module import of one of those SVGs) alongside the existing `icon` fallback.

**Context — verified during planning, not guessed:** `simple-icons@16.28.0`'s npm package ships every brand's SVG at a predictable path (`node_modules/simple-icons/icons/<slug>.svg`). The following slugs were confirmed to exist by directly listing that directory: `react`, `tailwindcss`, `vite`, `reactrouter`, `github`, `cloudflarepages`, `zapier`, `make`, `n8n`, `google`, `notion`, `airtable`, `astro`. Two tools do **not** have an entry in this library (also confirmed by directly searching the directory — not assumed from the earlier mockup, which used a CDN and turned out to be silently wrong for one of these): **OpenAI** and **GoHighLevel**. "API Integrations" isn't a specific brand and keeps its existing generic Lucide icon (no logo needed).

- [ ] **Step 1: Install simple-icons as a devDependency**

```bash
npm install --save-dev simple-icons@16.28.0
```

- [ ] **Step 2: Write the copy script**

```javascript
// scripts/copy-tool-logos.mjs
import { copyFileSync, mkdirSync } from 'fs'

const SOURCE_DIR = 'node_modules/simple-icons/icons'
const DEST_DIR = 'src/assets/tool-logos'

// Maps our tool key -> simple-icons slug. Every slug here was confirmed to
// exist in simple-icons@16.28.0 by listing node_modules/simple-icons/icons/
// directly during planning.
const LOGO_SLUGS = {
  react: 'react',
  tailwind: 'tailwindcss',
  vite: 'vite',
  router: 'reactrouter',
  github: 'github',
  cloudflare: 'cloudflarepages',
  zapier: 'zapier',
  make: 'make',
  n8n: 'n8n',
  google: 'google',
  notion: 'notion',
  airtable: 'airtable',
  astro: 'astro',
}

mkdirSync(DEST_DIR, { recursive: true })

for (const [toolKey, slug] of Object.entries(LOGO_SLUGS)) {
  copyFileSync(`${SOURCE_DIR}/${slug}.svg`, `${DEST_DIR}/${toolKey}.svg`)
  console.log(`copied ${slug}.svg -> ${DEST_DIR}/${toolKey}.svg`)
}

console.log('\nStill needed (no simple-icons entry — source from official brand/press kits):')
console.log('  - OpenAI: https://openai.com/brand (or their press kit)')
console.log('  - GoHighLevel: https://www.gohighlevel.com (check their partner/affiliate brand assets page)')
console.log(`Save those two as ${DEST_DIR}/openai.svg and ${DEST_DIR}/highlevel.svg once sourced.`)
```

- [ ] **Step 2b: Run it**

```bash
node scripts/copy-tool-logos.mjs
```

Expected: 13 files appear under `src/assets/tool-logos/`, plus the two "still needed" lines print.

- [ ] **Step 3: Source the two remaining logos manually**

Download OpenAI's and GoHighLevel's official logo marks (SVG preferred; PNG with transparent background is acceptable if SVG isn't available) from their official brand/press kit pages. Save as `src/assets/tool-logos/openai.svg` (or `.png`) and `src/assets/tool-logos/highlevel.svg` (or `.png`). If you cannot access an official kit in your environment, use a solid-color placeholder square as a temporary stand-in and flag it clearly as `DONE_WITH_CONCERNS` in your report — do not block the rest of this task on it.

- [ ] **Step 4: Update the tools data**

Rewrite `src/data/tools.js`:

```javascript
// Structured data: Core tools in use
import reactLogo from '../assets/tool-logos/react.svg'
import tailwindLogo from '../assets/tool-logos/tailwind.svg'
import viteLogo from '../assets/tool-logos/vite.svg'
import routerLogo from '../assets/tool-logos/router.svg'
import githubLogo from '../assets/tool-logos/github.svg'
import cloudflareLogo from '../assets/tool-logos/cloudflare.svg'
import zapierLogo from '../assets/tool-logos/zapier.svg'
import makeLogo from '../assets/tool-logos/make.svg'
import n8nLogo from '../assets/tool-logos/n8n.svg'
import googleLogo from '../assets/tool-logos/google.svg'
import notionLogo from '../assets/tool-logos/notion.svg'
import airtableLogo from '../assets/tool-logos/airtable.svg'
import astroLogo from '../assets/tool-logos/astro.svg'
import openaiLogo from '../assets/tool-logos/openai.svg'
import highlevelLogo from '../assets/tool-logos/highlevel.svg'

export const coreTools = [
  { key: 'react', label: 'React', icon: 'Code2', logo: reactLogo },
  { key: 'tailwind', label: 'Tailwind CSS', icon: 'Lightbulb', logo: tailwindLogo },
  { key: 'vite', label: 'Vite', icon: 'Settings', logo: viteLogo },
  { key: 'router', label: 'React Router', icon: 'ArrowRight', logo: routerLogo },
  { key: 'github', label: 'GitHub + Git', icon: 'Briefcase', logo: githubLogo },
  { key: 'cloudflare', label: 'Cloudflare Pages', icon: 'Shield', logo: cloudflareLogo },
  { key: 'zapier', label: 'Zapier', icon: 'Zap', logo: zapierLogo },
  { key: 'make', label: 'Make (Integromat)', icon: 'Settings', logo: makeLogo },
  { key: 'n8n', label: 'n8n', icon: 'Wrench', logo: n8nLogo },
  { key: 'google', label: 'Google Workspace', icon: 'Mail', logo: googleLogo },
  { key: 'notion', label: 'Notion', icon: 'Lightbulb', logo: notionLogo },
  { key: 'airtable', label: 'Airtable', icon: 'Lightbulb', logo: airtableLogo },
  { key: 'apis', label: 'API Integrations', icon: 'Code2' },
  { key: 'openai', label: 'OpenAI / AI Tools', icon: 'Robot', logo: openaiLogo },
  { key: 'highlevel', label: 'GoHighLevel', icon: 'Briefcase', logo: highlevelLogo },
  { key: 'astro', label: 'Astro', icon: 'Code2', logo: astroLogo },
]

// Provide a default export for resilience in dev/preview environments
export default { coreTools }
```

Note: `'Notion / Airtable'` (one entry) is now two entries (`notion`, `airtable`) — more, distinct logos is a strict improvement for a marquee. `'apis'` intentionally has no `logo` field — it's a generic capability, not a brand; `ToolsMarquee` (Task 3) must handle a missing `logo` gracefully by falling back to the Lucide `icon`.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors. (If Astro's asset pipeline complains about SVG imports, confirm `astro.config.mjs` doesn't need adjustment — SVG imports as plain URL strings are supported by Vite/Astro by default, no config change should be needed, but report `NEEDS_CONTEXT` if you hit an unexpected error here rather than guessing at a fix.)

- [ ] **Step 6: Commit**

```bash
git add scripts/copy-tool-logos.mjs src/assets/tool-logos/ src/data/tools.js package.json package-lock.json
git commit -m "feat: vendor real tool/platform logos, replacing generic icon placeholders"
```

---

### Task 3: Build the Tools Marquee and remove the old Core Tools panel

**Files:**
- Create: `src/components/ui/ToolsMarquee.jsx`
- Modify: `src/components/ui/SystemsPanel.jsx`
- Modify: `src/pages/profile.astro`

**Interfaces:**
- Consumes: `coreTools` shape from Task 2 (`{ key, label, icon, logo? }[]`).
- Produces: `<ToolsMarquee tools={coreTools} />` — a two-row auto-scrolling marquee.

- [ ] **Step 1: Write the marquee component**

```jsx
// src/components/ui/ToolsMarquee.jsx
import * as Icons from '../icons/icons'

function resolveIcon(name) {
  return Icons[name] || Icons.Lightbulb
}

/**
 * @param {{ tools: Array<{ key: string, label: string, icon: string, logo?: string }> }} props
 */
function ToolsMarquee({ tools }) {
  const midpoint = Math.ceil(tools.length / 2)
  const rowOne = tools.slice(0, midpoint)
  const rowTwo = tools.slice(midpoint)

  function renderRow(items, direction) {
    // Duplicated once so the CSS animation's -50% translation loops seamlessly.
    const doubled = [...items, ...items]
    return (
      <div className="tools-marquee-track">
        <div className={`tools-marquee-row tools-marquee-row--${direction}`}>
          {doubled.map((tool, index) => {
            const Icon = resolveIcon(tool.icon)
            return (
              <div key={`${tool.key}-${index}`} className="tools-marquee-item">
                {tool.logo ? (
                  <img src={tool.logo} alt="" width={30} height={30} className="tools-marquee-logo" />
                ) : (
                  <Icon className="tools-marquee-logo" aria-hidden="true" />
                )}
                <span>{tool.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="tools-marquee-wrap">
      {renderRow(rowOne, 'right')}
      {renderRow(rowTwo, 'left')}
    </div>
  )
}

export default ToolsMarquee
```

- [ ] **Step 2: Add the marquee CSS**

Append to `src/index.css`:

```css
.tools-marquee-wrap {
  border-radius: 20px;
  background: #f5f7fb;
  overflow: hidden;
}

.tools-marquee-track {
  display: flex;
  overflow: hidden;
  padding: 14px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent);
  mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent);
}

.tools-marquee-row {
  display: flex;
  width: max-content;
  gap: 10px;
}

.tools-marquee-row--right {
  animation: tools-marquee-right 32s linear infinite;
}

.tools-marquee-row--left {
  animation: tools-marquee-left 36s linear infinite;
}

.tools-marquee-wrap:hover .tools-marquee-row {
  animation-play-state: paused;
}

@keyframes tools-marquee-right {
  from {
    transform: translateX(-50%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes tools-marquee-left {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

.tools-marquee-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  white-space: nowrap;
  font: 600 15px 'Plus Jakarta Sans', system-ui, sans-serif;
  color: #94a3b8;
  transition: color 0.25s;
}

.tools-marquee-logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
  filter: grayscale(1) opacity(0.55);
  transition: filter 0.25s;
}

.tools-marquee-wrap:hover .tools-marquee-item {
  color: #1e293b;
}

.tools-marquee-wrap:hover .tools-marquee-logo {
  filter: none;
}
```

- [ ] **Step 3: Remove the old Core Tools sub-panel from SystemsPanel**

In `src/components/ui/SystemsPanel.jsx`:
- Remove the `tools: providedTools` destructured prop and the `staticTools`/`tools`/`featuredTools`/`moreToolsCount` locals.
- Remove the entire `<section>` block for "Core Tools In Use" (currently lines 42-58).
- Remove the now-unused `import * as Tools from '../../data/tools'` line.
- The right-column grid (Workflow Patterns + System Characteristics) currently sits alongside the Core Tools section in a `grid gap-4 xl:grid-cols-2` — since only two sections remain (Workflow Patterns, System Characteristics), keep them in that same grid; don't restructure further than removing the one section.

- [ ] **Step 4: Wire the marquee into profile.astro**

In `src/pages/profile.astro`, add the import:

```astro
import ToolsMarquee from '../components/ui/ToolsMarquee.jsx'
import { coreTools } from '../data/tools.js'
```

Add a new section immediately before the existing `"Systems & Workflows"` section (which currently starts around line 138):

```astro
    <section class="space-y-4">
      <SectionHeader
        title="Tools & Platforms"
        subtitle="Technologies and platforms used across delivery, at a glance."
      />
      <ToolsMarquee tools={coreTools} />
    </section>
```

Update the existing `<SystemsPanel .../>` call to drop the now-removed `tools` prop:

```astro
      <SystemsPanel
        workflowPatterns={profileContent.workflowPatterns || []}
        systemCharacteristics={profileContent.systemCharacteristics || []}
      />
```

- [ ] **Step 5: Verify visually**

Run: `npm run build && npm run preview -- --port 4173`, open `/profile`, confirm: the marquee renders above "Systems & Workflows", both rows scroll in opposite directions, hovering pauses the row and reveals full color, and the old "Core Tools In Use" panel is gone (Workflow Patterns / System Characteristics still render correctly). Stop the preview server when done.

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/ToolsMarquee.jsx src/components/ui/SystemsPanel.jsx src/pages/profile.astro src/index.css
git commit -m "feat: add animated tools marquee, retire the old core-tools grid"
```

---

### Task 4: Hero card polish

**Files:**
- Modify: `src/components/PersonalInfoCard.jsx`

**Interfaces:** None — self-contained, no prop changes.

- [ ] **Step 1: Add entrance animation and the glow ring**

In `src/components/PersonalInfoCard.jsx`, change the root `<section>` (currently line 13) to add `data-reveal` (mount-triggered — this section is above the fold, so it should already be in view on load, meaning the existing `scrollReveal` observer will fire it almost immediately, giving a gentle one-time entrance without needing separate mount-animation code):

```jsx
    <section
      data-reveal
      className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-8"
    >
```

Add a pulsing glow ring behind the photo. Currently (lines 15-24):

```jsx
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
```

Change to (adds one new always-on pulsing ring div, reusing the existing `pulse-soft` keyframe already defined in `src/styles/animations.css`):

```jsx
        <div className="flex justify-center lg:justify-center lg:self-center">
          <div className="group relative">
            <div
              className="absolute -inset-2 rounded-full bg-gradient-to-br from-brand-teal/40 to-brand-orange/40 blur-md"
              style={{ animation: 'pulse-soft 3.5s ease-in-out infinite' }}
              aria-hidden="true"
            />
            <ResponsivePicture
              image={photo}
              alt="Profile photo of Stephen Rey G. Agustinez"
              className="relative h-28 w-28 rounded-full border-2 border-brand-orange/25 object-cover shadow-lg transition-all duration-300 group-hover:scale-105 group-hover:border-brand-orange/45 sm:h-36 sm:w-36 lg:h-40 lg:w-40"
            />
            <div className="absolute inset-0 rounded-full bg-brand-teal/0 transition-all duration-300 group-hover:bg-brand-teal/10 group-hover:blur-xl" />
          </div>
        </div>
```

(`relative` added to `ResponsivePicture`'s className so it stacks above the new glow div, which is `absolute`.)

- [ ] **Step 2: Add the status pill**

In the name/role block (currently lines 28-32):

```jsx
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-600">Name</p>
              <h2 className="text-2xl font-semibold text-brand-ink sm:text-3xl">{aboutData.name}</h2>
              {aboutData.role ? <p className="text-sm text-brand-teal">{aboutData.role}</p> : null}
            </div>
```

Add a status pill immediately after (reusing the existing `.badge-pill` class from `src/index.css`, already used on the Home page hero):

```jsx
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-600">Name</p>
              <h2 className="text-2xl font-semibold text-brand-ink sm:text-3xl">{aboutData.name}</h2>
              {aboutData.role ? <p className="text-sm text-brand-teal">{aboutData.role}</p> : null}
              <span className="badge-pill inline-block">Available for part-time and full-time engagements</span>
            </div>
```

- [ ] **Step 3: Verify visually**

Run: `npm run build && npm run preview -- --port 4173`, open `/profile`, confirm: the card fades/slides in on load, a soft pulsing gradient glow is visible behind the photo, the status pill renders below the role text and matches the pill style already used elsewhere on the site (e.g. the Home page hero). Stop the preview server when done.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonalInfoCard.jsx
git commit -m "feat: add entrance animation, glow ring, and status pill to profile hero card"
```

---

### Task 5: Certifications hover polish

**Files:**
- Modify: `src/components/islands/CertificationsGallery.jsx`

**Interfaces:** None — self-contained, no prop changes.

- [ ] **Step 1: Rewrite the cert card**

Current per-cert markup (lines 20-42 today):

```jsx
          <div key={cert.id} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-5 text-center shadow-[0_18px_45px_rgba(60,28,120,0.14)]">
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
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                <BadgeCheck className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
            <h3 className="mt-3 text-sm font-semibold text-brand-ink">{cert.name}</h3>
            <p className="mt-1 text-xs text-slate-600">{cert.issuer}</p>
            {cert.issuedDate ? <p className="mt-1 text-xs text-slate-500">{formatCertDate(cert.issuedDate)}</p> : null}
          </div>
```

Replace with:

```jsx
          <div
            key={cert.id}
            className="group relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-5 text-center shadow-[0_18px_45px_rgba(60,28,120,0.14)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(60,28,120,0.20)]"
          >
            <div className="cert-shine" aria-hidden="true" />
            {cert.badgeImage ? (
              <button
                type="button"
                onClick={() => setSelectedCert(cert)}
                className="relative mx-auto block rounded-lg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                aria-label={`View ${cert.name} certificate full size`}
              >
                <ResponsivePicture
                  image={cert.badgeImage}
                  alt={`${cert.name} certificate`}
                  className="mx-auto h-20 w-auto object-contain"
                />
              </button>
            ) : (
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                <BadgeCheck className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
            <h3 className="relative mt-3 text-sm font-semibold text-brand-ink">{cert.name}</h3>
            <div className="relative mt-1 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-12 group-hover:opacity-100">
              <p className="text-xs text-slate-600">{cert.issuer}</p>
              {cert.issuedDate ? <p className="mt-0.5 text-xs text-slate-500">{formatCertDate(cert.issuedDate)}</p> : null}
            </div>
          </div>
```

- [ ] **Step 2: Add the shine-sweep CSS**

Append to `src/index.css`:

```css
.cert-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%);
  transform: translateX(-100%);
  pointer-events: none;
}

.group:hover .cert-shine {
  transform: translateX(100%);
  transition: transform 0.8s ease;
}
```

- [ ] **Step 3: Verify visually**

Run: `npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Platform Certifications, confirm: hovering a card lifts it slightly with a bigger shadow, a diagonal light sweep plays once across the card, and the issuer/date text is hidden at rest and appears smoothly on hover. Confirm clicking the badge still opens the full-size `ImageModal` exactly as before. Stop the preview server when done.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CertificationsGallery.jsx src/index.css
git commit -m "feat: add hover lift, shine sweep, and issuer reveal to certification cards"
```

---

### Task 6: Experience timeline rewrite

**Files:**
- Modify: `src/pages/profile.astro`

**Interfaces:**
- Consumes: `initScrollReveal()` wiring from Task 1 (already global via `Layout.astro`) and the `[data-reveal]`/`data-reveal-delay` CSS contract it establishes. No new consumer-facing interface.

- [ ] **Step 1: Rewrite the Experience section**

Current markup (today, roughly lines 97-131):

```astro
    <section class="space-y-4">
      <SectionHeader
        title="Experience"
        subtitle="Roles and work history that shaped my software, automation, and operations background."
      />
      <div class="space-y-6">
        {experiences.map((item) => (
          <section class="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex-1">
                <div class="mb-2 flex items-center gap-2">
                  <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
                  <p class="text-sm uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
                </div>
                <h3 class="text-2xl font-semibold text-brand-ink">{item.role}</h3>
                <p class="text-slate-700">{item.company}</p>
              </div>
              <div class="flex items-center gap-2 rounded-full bg-white/90 px-4 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 sm:whitespace-nowrap">
                <AnimatedIcon icon={Calendar} size={14} color="text-brand-teal" animationType="none" ariaLabel="Date range" />
                {item.dates}
              </div>
            </div>

            <ul class="mt-4 space-y-2 text-slate-700">
              {item.bullets.map((bullet) => (
                <li class="flex gap-3 leading-relaxed">
                  <AnimatedIcon icon={ArrowRight} size={16} color="text-brand-teal" animationType="none" className="mt-0.5 flex-shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
```

Replace with (left-rail: year badge → dot-on-line → card, staggered scroll reveal):

```astro
    <section class="space-y-4">
      <SectionHeader
        title="Experience"
        subtitle="Roles and work history that shaped my software, automation, and operations background."
      />
      <div class="relative mx-auto max-w-3xl">
        <div class="absolute left-[86px] top-1 bottom-1 w-0.5 bg-gradient-to-b from-brand-teal to-brand-orange" aria-hidden="true"></div>
        <div class="space-y-10">
          {experiences.map((item, index) => (
            <div
              class="grid grid-cols-[72px_20px_1fr] items-center gap-3"
              data-reveal
              data-reveal-delay={index * 90}
            >
              <div class="flex flex-col items-end justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-orange px-2.5 py-2 text-right text-white shadow-[0_8px_18px_rgba(122,0,255,0.28)]">
                <span class="text-sm font-bold leading-none">{item.dates}</span>
              </div>
              <div class="flex justify-center">
                <div class="h-3.5 w-3.5 rounded-full border-[3px] border-white bg-brand-orange shadow-[0_0_0_3px_rgba(122,0,255,0.25)]"></div>
              </div>
              <section class="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
                <div class="mb-2 flex items-center gap-2">
                  <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
                  <p class="text-sm uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
                </div>
                <h3 class="text-2xl font-semibold text-brand-ink">{item.role}</h3>
                <p class="text-slate-700">{item.company}</p>

                <ul class="mt-4 space-y-2 text-slate-700">
                  {item.bullets.map((bullet) => (
                    <li class="flex gap-3 leading-relaxed">
                      <AnimatedIcon icon={ArrowRight} size={16} color="text-brand-teal" animationType="none" className="mt-0.5 flex-shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ))}
        </div>
      </div>
    </section>
```

Note: `Calendar` icon import may now be unused in this file if nothing else references it — check with `grep -n "Calendar" src/pages/profile.astro` after this change and remove it from the `import { ... } from '../components/icons/icons.js'` line if so, to avoid an unused-import lint warning.

- [ ] **Step 2: Verify visually**

Run: `npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Experience: confirm the year badge sits left of a continuous vertical line with dots, cards are to the right, and each row fades/slides/scales in with a slight stagger as you scroll down (open DevTools' Rendering tab and enable "Emulate CSS media feature prefers-reduced-motion: reduce" to confirm rows still end up fully visible, just without the animated transition). Stop the preview server when done.

- [ ] **Step 3: Typecheck, lint, and build**

Run: `npm run typecheck && npx eslint src/pages/profile.astro && npm run build`
Expected: no errors, no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add src/pages/profile.astro
git commit -m "feat: rebuild experience section as a left-rail timeline with scroll-reveal"
```

---

### Task 7: Portfolio card and detail modal components

**Files:**
- Modify: `src/lib/content/projects.ts` (export `ProjectData`, name its currently-untyped fields explicitly)
- Create: `src/components/PortfolioCard.jsx`
- Create: `src/components/ProjectDetailModal.jsx`

**Interfaces:**
- Produces: `<PortfolioCard project={ProjectData} onClick={() => void} />` — a single cover-image-plus-title slide (no carousel logic — that's Task 8's job; this component just renders one card).
- Produces: `<ProjectDetailModal project={ProjectData | null} isOpen={boolean} onClose={() => void} onImageClick={(image) => void} />` — the detail view, functionally equivalent to `PortfolioRow`'s current expanded state (lines 173-266 today), extracted into its own component.
- `ProjectData` shape, after Step 0 below: `{ id, title: string, description: string, type: string, techStack: string[], liveUrl?, sourceUrl?, image, optimizedImage, galleryImages: Array<{ id, url, optimized, altText, sortOrder }> }`.

- [ ] **Step 0: Export `ProjectData` and name its fields explicitly**

`interface ProjectData` in `src/lib/content/projects.ts` (currently around line 16) is not exported today, and `title`/`description`/`type` only flow through its catch-all `[key: string]: unknown` index signature — every other file that will now reference this type via JSDoc (`PortfolioCard.jsx`, `ProjectDetailModal.jsx`, `PortfolioGallery.jsx`) needs it properly exported and named, matching the convention already used by `OptimizedPicture`/`OptimizeImageOptions` in `src/lib/images/optimizeImage.ts` (both `export interface`). Change:

```typescript
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
```

to:

```typescript
export interface ProjectData {
  id: string
  title: string
  description: string
  type: string
  image?: ImageSource
  optimizedImage?: OptimizedPicture | null
  imageUrl?: string
  galleryImages?: GalleryImage[]
  liveUrl?: string
  sourceUrl?: string
  techStack?: string[]
  [key: string]: unknown
}
```

(The index signature stays — other loosely-typed fields like `sortOrder`/`status` still flow through it — this just names the fields the new components actually consume.)

- [ ] **Step 1: Write PortfolioCard**

```jsx
// src/components/PortfolioCard.jsx
import ResponsivePicture from './ResponsivePicture'

/**
 * @param {{
 *   project: import('../lib/content/projects').ProjectData,
 *   onClick: () => void,
 * }} props
 */
function PortfolioCard({ project, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="portfolio-card-slide block w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 text-left shadow-[0_14px_32px_rgba(60,28,120,0.16)] transition-transform hover:-translate-y-1"
      aria-label={`View ${project.title} project details`}
    >
      <ResponsivePicture
        image={project.optimizedImage}
        alt={`${project.title} cover`}
        className="h-[200px] w-full object-cover"
      />
      <div className="p-4">
        <h3 className="text-base font-semibold text-white">{project.title}</h3>
      </div>
    </button>
  )
}

export default PortfolioCard
```

- [ ] **Step 2: Write ProjectDetailModal**

```jsx
// src/components/ProjectDetailModal.jsx
import { useMemo, useState } from 'react'
import PrimaryButton from './PrimaryButton'
import AnimatedIcon from './icons/AnimatedIcon'
import ResponsivePicture from './ResponsivePicture'
import { ExternalLink, Code2, ChevronLeft, ChevronRight } from './icons/icons'

/**
 * @param {{
 *   project: import('../lib/content/projects').ProjectData | null,
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onImageClick: (image: { optimized: unknown, altText?: string }) => void,
 * }} props
 */
function ProjectDetailModal({ project, isOpen, onClose, onImageClick }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const isInternalLiveLink = project?.liveUrl?.startsWith('/')

  const galleryImages = useMemo(() => {
    if (!project) return []
    const items = Array.isArray(project.galleryImages) ? project.galleryImages.filter((item) => item?.url) : []
    if (items.length > 0) return items
    if (project.image) {
      return [{ id: `${project.id}-cover`, url: project.image, optimized: project.optimizedImage, altText: `${project.title} cover`, sortOrder: 1 }]
    }
    return []
  }, [project])

  const activeImage = galleryImages[activeIndex] || galleryImages[0] || null

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? galleryImages.length - 1 : current - 1))
  }

  function showNext() {
    setActiveIndex((current) => (current === galleryImages.length - 1 ? 0 : current + 1))
  }

  function handleClose() {
    setActiveIndex(0)
    onClose()
  }

  if (!isOpen || !project) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-2xl font-semibold text-white">{project.title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close project details"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/30">
              {activeImage ? (
                <button type="button" onClick={() => onImageClick(activeImage)} className="block w-full">
                  <ResponsivePicture
                    image={activeImage.optimized}
                    alt={activeImage.altText || `${project.title} gallery image ${activeIndex + 1}`}
                    className="h-[260px] w-full object-cover sm:h-[360px]"
                  />
                </button>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-slate-300 sm:h-[360px]">
                  No gallery images available.
                </div>
              )}
            </div>

            {galleryImages.length > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={showPrevious} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <button type="button" onClick={showNext} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
                <p className="text-sm text-slate-300">Slide {activeIndex + 1} of {galleryImages.length}</p>
              </div>
            ) : null}

            {galleryImages.length > 1 ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {galleryImages.map((image, index) => (
                  <button
                    key={image.id || image.url}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`overflow-hidden rounded-lg border transition ${index === activeIndex ? 'border-brand-teal ring-2 ring-brand-teal/50' : 'border-white/10 hover:border-white/25'}`}
                  >
                    <ResponsivePicture image={image.optimized} alt={image.altText || `${project.title} thumbnail ${index + 1}`} className="h-20 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm leading-relaxed text-slate-200/80">{project.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.techStack.map((tech) => (
                <span key={tech} className="badge-pill">{tech}</span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {project.liveUrl && project.liveUrl !== '#' ? (
                <PrimaryButton {...(isInternalLiveLink ? { to: project.liveUrl } : { href: project.liveUrl })} variant="primary" className="px-4 py-2">
                  <span>Live Demo</span>
                  <AnimatedIcon icon={ExternalLink} size={16} color="inherit" animationType="hover-slide" ariaLabel="Open live demo" />
                </PrimaryButton>
              ) : null}
              {project.sourceUrl && project.sourceUrl !== '#' ? (
                <PrimaryButton href={project.sourceUrl} variant="secondary" className="px-4 py-2">
                  <span>Source Code</span>
                  <AnimatedIcon icon={Code2} size={16} color="inherit" animationType="hover-slide" ariaLabel="View source code" />
                </PrimaryButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectDetailModal
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors. (These two components aren't wired into any page yet — Task 8 does that — so this step only confirms they compile in isolation.)

- [ ] **Step 3: Commit**

```bash
git add src/components/PortfolioCard.jsx src/components/ProjectDetailModal.jsx
git commit -m "feat: add PortfolioCard and ProjectDetailModal components"
```

---

### Task 8: Wire the Embla carousel into PortfolioGallery, retire PortfolioRow

**Files:**
- Modify: `src/components/islands/PortfolioGallery.jsx`
- Delete: `src/components/PortfolioRow.jsx`

**Interfaces:**
- Consumes: `PortfolioCard`/`ProjectDetailModal` from Task 7; `embla-carousel-react`/`embla-carousel-autoplay` (see Global Constraints for the verified API).

- [ ] **Step 1: Rewrite PortfolioGallery**

```jsx
// src/components/islands/PortfolioGallery.jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import PortfolioCard from '../PortfolioCard'
import ProjectDetailModal from '../ProjectDetailModal'
import ImageModal from '../ImageModal'

const CATEGORIES = [
  { label: 'Automation Buildouts', value: 'Automation' },
  { label: 'Website Buildouts', value: 'Website' },
]

function PortfolioGallery({ projects }) {
  const [category, setCategory] = useState('Automation')
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedImage, setSelectedImage] = useState(null)
  const autoplayRef = useRef(
    Autoplay({ delay: 3000, stopOnMouseEnter: true, stopOnInteraction: false }),
  )

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center' },
    prefersReducedMotion ? [] : [autoplayRef.current],
  )

  const filteredItems = projects.filter((item) =>
    category === 'Website' ? item.type === 'Website' : item.type === 'Automation',
  )

  const applyCenterFocus = useCallback(() => {
    if (!emblaApi) return
    const rootRect = emblaApi.rootNode().getBoundingClientRect()
    const centerX = rootRect.left + rootRect.width / 2

    emblaApi.slideNodes().forEach((slideNode) => {
      const slideRect = slideNode.getBoundingClientRect()
      const slideCenter = slideRect.left + slideRect.width / 2
      const distance = Math.abs(slideCenter - centerX)
      const normalized = Math.min(distance / (rootRect.width / 2), 1)
      slideNode.style.opacity = String(1 - normalized * 0.6)
      slideNode.style.filter = `blur(${(normalized * 3).toFixed(2)}px)`
      slideNode.style.transform = `scale(${(1 - normalized * 0.1).toFixed(3)})`
    })
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return undefined
    applyCenterFocus()
    emblaApi.on('scroll', applyCenterFocus)
    emblaApi.on('reInit', applyCenterFocus)
    return () => {
      emblaApi.off('scroll', applyCenterFocus)
      emblaApi.off('reInit', applyCenterFocus)
    }
  }, [emblaApi, applyCenterFocus])

  useEffect(() => {
    emblaApi?.reInit()
  }, [emblaApi, category])

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            className={`rounded-full px-4 py-2 font-semibold transition-colors duration-200 ${
              category === cat.value ? 'bg-brand-teal text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand-ink'
            }`}
            onClick={() => setCategory(cat.value)}
            type="button"
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="portfolio-carousel-wrap relative mt-6 max-w-[900px] overflow-hidden rounded-2xl bg-slate-950/20 py-6" ref={emblaRef}>
        <div className="flex gap-5 px-10">
          {filteredItems.map((project) => (
            <div key={project.id} className="min-w-[340px] flex-shrink-0 transition-[opacity,filter,transform] duration-150">
              <PortfolioCard project={project} onClick={() => setSelectedProject(project)} />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => emblaApi?.scrollPrev()}
          className="portfolio-carousel-arrow absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white p-3 text-brand-teal shadow-lg"
          aria-label="Previous project"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => emblaApi?.scrollNext()}
          className="portfolio-carousel-arrow absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white p-3 text-brand-teal shadow-lg"
          aria-label="Next project"
        >
          ›
        </button>
      </div>

      <ProjectDetailModal
        project={selectedProject}
        isOpen={Boolean(selectedProject)}
        onClose={() => setSelectedProject(null)}
        onImageClick={(image) => setSelectedImage(image)}
      />

      <ImageModal
        image={selectedImage?.optimized || null}
        alt={selectedImage?.altText || 'Portfolio project screenshot'}
        isOpen={Boolean(selectedImage)}
        onClose={() => setSelectedImage(null)}
        caption={selectedImage?.altText || ''}
      />
    </>
  )
}

export default PortfolioGallery
```

- [ ] **Step 2: Add the carousel arrow hover-reveal CSS**

Append to `src/index.css`:

```css
.portfolio-carousel-arrow {
  opacity: 0;
  transition: opacity 0.25s;
}

.portfolio-carousel-wrap:hover .portfolio-carousel-arrow {
  opacity: 1;
}
```

- [ ] **Step 3: Delete PortfolioRow**

```bash
rm src/components/PortfolioRow.jsx
```

Confirm nothing else imports it: `grep -rn "PortfolioRow" src/` should return no results after this change.

- [ ] **Step 4: Verify visually**

Run: `npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Portfolio:
- Confirm the carousel auto-rotates continuously and loops seamlessly (Embla's `loop: true` handles this internally — no manual slide duplication needed, unlike the earlier browser mockup which had to duplicate slides by hand).
- Hover the carousel: confirm it pauses (autoplay's `stopOnMouseEnter`) and the arrow buttons fade in.
- Click an arrow: confirm it advances one card.
- Confirm the centered card is sharp/full-opacity and cards toward the edges are progressively faded/blurred/scaled down.
- Click a card: confirm `ProjectDetailModal` opens with the correct gallery, description, tech stack, and links; confirm the category filter still works and switching category loads a different set of cards into the carousel.
- Click the large image inside the modal: confirm it opens `ImageModal` for a full-size view, exactly as `PortfolioRow` did before.
- In DevTools, enable "Emulate CSS media feature prefers-reduced-motion: reduce", reload, and confirm the carousel does **not** auto-rotate (manual arrow clicks should still work).
- Stop the preview server when done.

- [ ] **Step 5: Typecheck, lint, and build**

Run: `npm run typecheck && npx eslint src/components/islands/PortfolioGallery.jsx src/components/PortfolioCard.jsx src/components/ProjectDetailModal.jsx && npm run build`
Expected: no errors.

- [ ] **Step 6: Run the existing e2e suite**

Run: `npx playwright test image-weight --project=static` (the portfolio images are unchanged — cover images still route through the same `optimizeImage()` pipeline — so this should still pass without modification; if it doesn't, investigate before proceeding, don't just raise the budget).

- [ ] **Step 7: Commit**

```bash
git add src/components/islands/PortfolioGallery.jsx src/index.css
git rm src/components/PortfolioRow.jsx
git commit -m "feat: replace expandable portfolio rows with an auto-rotating Embla carousel"
```

---

## Self-Review Notes

- **Spec coverage:** all five spec sections (marquee, hero, certifications, timeline, carousel) map to Tasks 2-3, 4, 5, 6, 7-8 respectively; the shared scroll-reveal utility (spec's cross-cutting requirement) is Task 1.
- **Corrections made during planning that the spec didn't have:** (1) Embla's real API names were verified against the installed package's `.d.ts` files and differ from what generic web searches suggested (`scrollNext`/`scrollPrev`/`scrollTo`, not `goToNext`/`goToPrev`; `scrollSnapList`/`selectedScrollSnap`, not `snapList`/`selectedSnap`) — Task 8's code uses only verified names. (2) Make.com **does** have a `simple-icons` entry (the spec/mockup phase assumed it didn't); OpenAI and Google Workspace's exact slug situation was re-verified — OpenAI genuinely has no entry (source separately), "Google Workspace" uses the generic `google` slug.
- **Type/interface consistency:** `ProjectData`'s shape is referenced identically in Task 7 (`PortfolioCard`, `ProjectDetailModal`) and Task 8 (`PortfolioGallery`) — no drift. `OptimizedPicture`/`ResponsivePicture`'s contract (from the earlier performance work) is unchanged and reused as-is throughout.
- **Gap found and fixed during self-review:** `ProjectData` in `src/lib/content/projects.ts` was not exported and didn't name `title`/`description`/`type` explicitly (they only flowed through its catch-all index signature) — every JSDoc reference to it from the new components (Task 7/8) would have pointed at an unresolvable type. Added Task 7 Step 0 to export it and name those three fields, matching the `export interface` convention already used by `OptimizedPicture`/`OptimizeImageOptions`.
- **No placeholders:** every task's code blocks are complete, copy-pasteable, and reference real current file content (verified by reading each file immediately before writing its task).
