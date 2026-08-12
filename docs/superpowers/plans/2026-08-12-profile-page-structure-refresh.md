# Profile Page Structure Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the two disconnected Certifications lists into one, convert Experience rows into compact click-to-expand entries with a detail modal, remove the dead Skills and Systems & Workflows sections from the public page, widen the Tools & Platforms marquee to four slower rows, and give the Portfolio carousel a seamless (no-bounding-box) edge fade — per `docs/superpowers/specs/2026-08-12-profile-page-structure-refresh-design.md`.

**Architecture:** Five independently-shippable tasks, no cross-task dependencies except that all of them edit `src/pages/profile.astro` (in different, non-overlapping sections) — do them in order so each task's file-state assumptions hold. Everything is presentation-only: no data model, D1, or admin CMS changes.

**Tech Stack:** Astro 7, React 19 islands, Tailwind CSS 3.4 (native `line-clamp` support, no plugin needed).

## Global Constraints

- `.jsx` files: JSDoc prop types matching this repo's existing convention (see `src/components/ResponsivePicture.jsx`, `src/components/ProjectDetailModal.jsx`).
- Immutability: spread-based state updates, never mutate in place.
- No `console.log` in committed code.
- Commit format: `<type>: <description>` (conventional commits) — this repo's commitlint enforces `[build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test]` as the only valid types.
- Verify every task with `npm run typecheck && npm run build`. Use `npm run build && npm run preview -- --port 4173` for visual/interaction verification, then stop the preview server before finishing — don't leave `node.exe` processes running.
- No data-model, D1, or admin CMS changes in this plan — every task is presentation-only, per the spec's explicit Non-Goals.
- **Verified facts from reading the actual current files (do not re-derive):**
  - `SkillsSection.jsx` and `SystemsPanel.jsx` are imported nowhere except `src/pages/profile.astro` and their own definition files — safe to delete outright.
  - `.portfolio-carousel-wrap` (in `PortfolioGallery.jsx`) has no background/border of its own today — only `PortfolioCard.jsx`'s own light gradient background paints each card. The edge-fade mask will correctly reveal the page's own background at the edges with no extra CSS needed to "remove a box" — there isn't one to remove.
  - `initScrollReveal()` (`src/lib/scrollReveal.ts`) runs once from a `<script>` in `Layout.astro` after DOM parse, and does a single `querySelectorAll('[data-reveal]')`. Astro islands are always server-rendered into the initial HTML regardless of their `client:*` hydration directive — only *hydration* (attaching JS behavior) is deferred, not the markup itself. So converting the Experience section to a `client:visible` island does **not** remove `[data-reveal]` elements from the initial HTML; the existing scroll-reveal script will find them exactly as it does today. Verify this holds in Task 5's manual check rather than assuming — but it is not expected to need a workaround.
  - Tailwind 3.4's `line-clamp-*` utilities are already used elsewhere in this codebase (`src/pages/services.astro:117`) — no plugin/config change needed to use `line-clamp-1`.
  - `AnimatedIcon`'s `animationType="hover-slide"` applies `group-hover:translate-x-1` — it only animates if the icon's ancestor button/link has Tailwind's `group` class. Every new "View details" button in this plan includes `group` in its `className` for this reason.

## File Structure

| File | Responsibility |
|---|---|
| `src/pages/profile.astro` | Removes Skills/Systems sections (Task 1), restructures Certifications (Task 2), swaps inline Experience markup for the new island (Task 5) |
| `src/components/ui/SkillsSection.jsx`, `src/components/ui/SystemsPanel.jsx` | Deleted (Task 1) |
| `src/components/ui/ToolsMarquee.jsx` | Generalized from 2 to 4 rows (Task 3) |
| `src/index.css` | Adds the Portfolio edge-fade mask rule (Task 4) |
| `src/components/islands/ExperienceTimeline.jsx` (new) | The Experience timeline as a client-hydrated island: renders the unchanged badge/dot/line structure, compact card content, and modal-open state (Task 5) |
| `src/components/ExperienceDetailModal.jsx` (new) | Full experience detail (title tag, role, company, dates, full bullet list) shown on "View details" click (Task 5) |

---

## Task 1: Remove Skills and Systems & Workflows sections

**Files:**
- Delete: `src/components/ui/SkillsSection.jsx`
- Delete: `src/components/ui/SystemsPanel.jsx`
- Modify: `src/pages/profile.astro`

**Interfaces:** None — self-contained deletions, no other file imports either component.

- [ ] **Step 1: Delete the two component files**

Delete `src/components/ui/SkillsSection.jsx` and `src/components/ui/SystemsPanel.jsx` entirely (not just unmount — confirmed above that nothing else imports them).

- [ ] **Step 2: Remove their imports from `profile.astro`**

Find and delete these two lines from the frontmatter's import block:

```javascript
import SkillsSection from '../components/ui/SkillsSection.jsx'
import SystemsPanel from '../components/ui/SystemsPanel.jsx'
```

- [ ] **Step 3: Remove the Skills render block**

Find and delete this block (it sits between the Experience `</section>` and the Tools & Platforms `<section>`):

```astro
    <SkillsSection
      technicalSkills={profileContent.skills?.technical || []}
      personalSkills={profileContent.skills?.personal || []}
    />

```

- [ ] **Step 4: Remove the Systems & Workflows section**

Find and delete this whole block (it sits between the Tools & Platforms `</section>` and the Portfolio `<section>`):

```astro
    <section class="space-y-4">
      <SectionHeader
        title="Systems & Workflows"
        subtitle="Repeatable workflow patterns and operating characteristics used across delivery."
      />
      <SystemsPanel
        client:visible
        workflowPatterns={profileContent.workflowPatterns || []}
        systemCharacteristics={profileContent.systemCharacteristics || []}
      />
    </section>

```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 6: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`. Confirm: no "Skills" heading anywhere, no "Systems & Workflows" heading anywhere, and the page flows directly from Experience → Tools & Platforms → Portfolio. Stop the preview server when done.

- [ ] **Step 7: Commit**

```bash
git add src/pages/profile.astro
git rm src/components/ui/SkillsSection.jsx src/components/ui/SystemsPanel.jsx
git commit -m "refactor: remove the blank Skills and Systems & Workflows sections from Profile"
```

---

## Task 2: Certifications — merge Platform Certifications in as a labeled sub-group

**Files:**
- Modify: `src/pages/profile.astro`

**Interfaces:** None — no prop/data changes to `CertificationLogo.jsx` or `CertificationsGallery.jsx`, both consumed exactly as they are today, just relocated.

- [ ] **Step 1: Read the current Certifications and Platform Certifications blocks**

Confirm both blocks still look exactly as described below before editing — this plan was written against a specific snapshot.

- [ ] **Step 2: Replace the Certifications block**

Find this block (inside the sidebar/document-flow grid):

```astro
        <section class="border-t border-slate-200 pt-8">
          <h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Certifications</h3>
          <ul class="mt-4 space-y-4">
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
        </section>
```

Replace it with:

```astro
        <section class="border-t border-slate-200 pt-8">
          <h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Certifications</h3>

          <p class="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">Professional</p>
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
```

(`certifications` is already defined earlier in the frontmatter as `const certifications = profileContent.certifications || []` — no new variable needed.)

- [ ] **Step 3: Remove the standalone "Platform Certifications" section**

Find and delete this whole block (it sits between the sidebar/document-flow grid's closing `</div>` and the Experience `<section>`):

```astro
    {certifications.length > 0 ? (
      <section class="space-y-4">
        <SectionHeader
          title="Platform Certifications"
          subtitle="Automation platform training completed through recognized programs."
        />
        <CertificationsGallery client:visible certifications={certifications} />
      </section>
    ) : null}

```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`. Confirm: one "Certifications" heading in the sidebar/document-flow area, with a "Professional" sub-label above the CCNA/Google/OWASP/CCSP list and a "Platform Training" sub-label above the Zapier/Make/n8n/HighLevel image gallery — both under the same heading, no separate "Platform Certifications" section anywhere else on the page. Click a platform badge image and confirm it still opens `ImageModal` at full size. Stop the preview server when done.

- [ ] **Step 6: Commit**

```bash
git add src/pages/profile.astro
git commit -m "refactor: merge Platform Certifications into the Certifications section as a labeled sub-group"
```

---

## Task 3: Tools & Platforms — four rows instead of two

**Files:**
- Modify: `src/components/ui/ToolsMarquee.jsx`

**Interfaces:** None — `ToolsMarquee`'s `{ tools }` prop is unchanged; this is an internal rendering change only.

- [ ] **Step 1: Read the current file**

Confirm `ToolsMarquee.jsx` still splits into exactly 2 rows via `Math.ceil(tools.length / 2)` before editing.

- [ ] **Step 2: Replace the whole file**

```jsx
import * as Icons from '../icons/icons'

const ROW_COUNT = 4
const ROW_DURATIONS_SECONDS = [30, 34, 38, 42]

function resolveIcon(name) {
  return Icons[name] || Icons.Lightbulb
}

/**
 * @param {Array<{ key: string, label: string, icon: string, logo?: string }>} tools
 * @param {number} rowCount
 * @returns {Array<Array<{ key: string, label: string, icon: string, logo?: string }>>}
 */
function splitIntoRows(tools, rowCount) {
  const base = Math.floor(tools.length / rowCount)
  const remainder = tools.length % rowCount
  const rows = []
  let start = 0
  for (let index = 0; index < rowCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0)
    rows.push(tools.slice(start, start + size))
    start += size
  }
  return rows.filter((row) => row.length > 0)
}

/**
 * @param {{ tools: Array<{ key: string, label: string, icon: string, logo?: string }> }} props
 */
function ToolsMarquee({ tools }) {
  const rows = splitIntoRows(tools, ROW_COUNT)

  function renderRow(items, rowIndex) {
    const direction = rowIndex % 2 === 0 ? 'right' : 'left'
    const durationSeconds = ROW_DURATIONS_SECONDS[rowIndex % ROW_DURATIONS_SECONDS.length]
    // Duplicated once so the CSS animation's -50% translation loops seamlessly.
    const doubled = [...items, ...items]
    return (
      <div className="tools-marquee-track" key={rowIndex}>
        <div
          className={`tools-marquee-row tools-marquee-row--${direction}`}
          style={{ animationDuration: `${durationSeconds}s` }}
        >
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
      {rows.map((row, index) => renderRow(row, index))}
    </div>
  )
}

export default ToolsMarquee
```

This changes 29 tools from a 15/14 split into an 8/7/7/7 split across 4 rows, alternating direction (right, left, right, left) with four distinct durations (30s/34s/38s/42s) instead of the previous fixed 32s/36s pair. The existing `.tools-marquee-row--right`/`--left` CSS classes are reused as-is — no CSS changes needed in this task, since duration is now set per-row via inline `style`, overriding the CSS classes' own `animation-duration` (the `animation: ... 32s ...` shorthand in `index.css` still supplies the timing function/iteration-count; the inline `animationDuration` longhand override only replaces the duration component).

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 4: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Tools & Platforms. Confirm: 4 rows render, all 29 tools are present across them, rows alternate direction, and the overall motion reads as slower than before. Hover the marquee and confirm all 4 rows pause together (existing `.tools-marquee-wrap:hover .tools-marquee-row` rule, untouched). Stop the preview server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ToolsMarquee.jsx
git commit -m "feat: widen the Tools & Platforms marquee to four slower rows"
```

---

## Task 4: Portfolio carousel — seamless edge fade

**Files:**
- Modify: `src/index.css`

**Interfaces:** None — pure CSS addition, no JS/prop changes.

- [ ] **Step 1: Add the mask-image rule**

In `src/index.css`, find the existing `.portfolio-carousel-arrow` rules (search for `.portfolio-carousel-arrow`). Immediately before or after that block, add:

```css
.portfolio-carousel-wrap {
  -webkit-mask-image: linear-gradient(90deg, transparent, black 15%, black 85%, transparent);
  mask-image: linear-gradient(90deg, transparent, black 15%, black 85%, transparent);
}
```

Do not add any `background`, `border`, or `box-shadow` to `.portfolio-carousel-wrap` — confirmed in this plan's Global Constraints that it has none today, and the fade must reveal the page's own background directly, not a panel color, so none should be added here either.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors (this is a CSS-only change; typecheck isn't expected to catch anything, but run it anyway per this plan's global convention).

- [ ] **Step 3: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Portfolio. Confirm: cards near the left/right edges of the carousel fade out smoothly into the page background (no hard clip, no visible rectangle/border around the carousel), the centered card stays fully opaque, the existing subtle scale-up on the centered card (`--center-scale`) still works, and autoplay/hover-pause/manual arrows/category tabs are all unaffected. Stop the preview server when done.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: fade the Portfolio carousel's edges seamlessly into the page background"
```

---

## Task 5: Experience — compact row + detail modal

**Files:**
- Create: `src/components/ExperienceDetailModal.jsx`
- Create: `src/components/islands/ExperienceTimeline.jsx`
- Modify: `src/pages/profile.astro`

**Interfaces:**
- `ExperienceDetailModal` consumes: `{ experience: { title: string, role: string, company: string, dates: string, bullets: string[] } | null, isOpen: boolean, onClose: () => void }`
- `ExperienceTimeline` consumes: `{ experiences: Array<{ id?: string, title: string, role: string, company: string, dates: string, bullets: string[] }> }` — same shape `profile.astro` already passes to today's inline markup.

- [ ] **Step 1: Read the current inline Experience markup and the existing modal convention**

Read `profile.astro`'s current Experience section (the year-badge/dot/card `.map()` loop) and `src/components/ProjectDetailModal.jsx` in full — the new modal must match its exact conventions (dark overlay `bg-black/60 backdrop-blur-sm`, panel `bg-slate-950/95`, Escape-to-close, `document.body.style.overflow = 'hidden'` while open) rather than inventing a new modal style.

- [ ] **Step 2: Create `src/components/ExperienceDetailModal.jsx`**

```jsx
import { useEffect } from 'react'
import AnimatedIcon from './icons/AnimatedIcon'
import { ArrowRight, Briefcase } from './icons/icons'

/**
 * @param {{
 *   experience: { title: string, role: string, company: string, dates: string, bullets: string[] } | null,
 *   isOpen: boolean,
 *   onClose: () => void,
 * }} props
 */
function ExperienceDetailModal({ experience, isOpen, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && isOpen) {
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

  if (!isOpen || !experience) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="experience-detail-title"
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
              <p className="text-sm uppercase tracking-[0.14em] text-slate-300">{experience.title}</p>
            </div>
            <h3 id="experience-detail-title" className="mt-1 text-2xl font-semibold text-white">{experience.role}</h3>
            <p className="text-slate-300">{experience.company}</p>
            <p className="mt-1 text-sm text-slate-400">{experience.dates}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close experience details"
          >
            ✕
          </button>
        </div>

        <ul className="mt-6 space-y-3 text-slate-200/90">
          {experience.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-3 leading-relaxed">
              <AnimatedIcon icon={ArrowRight} size={16} color="text-brand-teal" animationType="none" className="mt-0.5 flex-shrink-0" />
              <span className="break-words">{bullet}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default ExperienceDetailModal
```

- [ ] **Step 3: Create `src/components/islands/ExperienceTimeline.jsx`**

```jsx
import { useState } from 'react'
import AnimatedIcon from '../icons/AnimatedIcon'
import { ArrowRight, Briefcase } from '../icons/icons'
import ExperienceDetailModal from '../ExperienceDetailModal'

/**
 * @param {{
 *   experiences: Array<{ id?: string, title: string, role: string, company: string, dates: string, bullets: string[] }>,
 * }} props
 */
function ExperienceTimeline({ experiences }) {
  const [selectedExperience, setSelectedExperience] = useState(null)

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute left-[112px] sm:left-[242px] top-1 bottom-1 w-0.5 bg-gradient-to-b from-brand-teal to-brand-orange" aria-hidden="true"></div>
      <div className="space-y-10">
        {experiences.map((item, index) => (
          <div
            key={item.id || index}
            className="grid grid-cols-[90px_20px_1fr] sm:grid-cols-[220px_20px_1fr] items-center gap-3"
            data-reveal
            data-reveal-delay={index * 90}
          >
            <div className="flex flex-col items-end justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-orange px-2.5 py-2 text-right text-white shadow-[0_8px_18px_rgba(122,0,255,0.28)]">
              <span className="text-xs sm:text-sm font-bold leading-tight sm:leading-none whitespace-normal sm:whitespace-nowrap">{item.dates}</span>
            </div>
            <div className="flex justify-center">
              <div className="h-3.5 w-3.5 rounded-full border-[3px] border-white bg-brand-orange shadow-[0_0_0_3px_rgba(122,0,255,0.25)]"></div>
            </div>
            <section className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-4 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
              <div className="mb-2 flex items-center gap-2">
                <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
                <p className="text-sm uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
              </div>
              <h3 className="text-2xl font-semibold text-brand-ink break-words">{item.role}</h3>
              <p className="text-slate-700">{item.company}</p>

              {item.bullets?.[0] ? (
                <p className="mt-4 line-clamp-1 text-slate-700">{item.bullets[0]}</p>
              ) : null}

              <button
                type="button"
                onClick={() => setSelectedExperience(item)}
                className="group mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal transition hover:text-brand-ink"
              >
                View details
                <AnimatedIcon icon={ArrowRight} size={14} color="inherit" animationType="hover-slide" ariaLabel="View full experience details" />
              </button>
            </section>
          </div>
        ))}
      </div>

      <ExperienceDetailModal
        experience={selectedExperience}
        isOpen={Boolean(selectedExperience)}
        onClose={() => setSelectedExperience(null)}
      />
    </div>
  )
}

export default ExperienceTimeline
```

- [ ] **Step 4: Replace the inline Experience markup in `profile.astro`**

Find this block:

```astro
    <section class="space-y-4">
      <SectionHeader
        title="Experience"
        subtitle="Roles and work history that shaped my software, automation, and operations background."
      />
      <div class="relative mx-auto max-w-3xl">
        <div class="absolute left-[112px] sm:left-[242px] top-1 bottom-1 w-0.5 bg-gradient-to-b from-brand-teal to-brand-orange" aria-hidden="true"></div>
        <div class="space-y-10">
          {experiences.map((item, index) => (
            <div
              class="grid grid-cols-[90px_20px_1fr] sm:grid-cols-[220px_20px_1fr] items-center gap-3"
              data-reveal
              data-reveal-delay={index * 90}
            >
              <div class="flex flex-col items-end justify-center rounded-xl bg-gradient-to-br from-brand-teal to-brand-orange px-2.5 py-2 text-right text-white shadow-[0_8px_18px_rgba(122,0,255,0.28)]">
                <span class="text-xs sm:text-sm font-bold leading-tight sm:leading-none whitespace-normal sm:whitespace-nowrap">{item.dates}</span>
              </div>
              <div class="flex justify-center">
                <div class="h-3.5 w-3.5 rounded-full border-[3px] border-white bg-brand-orange shadow-[0_0_0_3px_rgba(122,0,255,0.25)]"></div>
              </div>
              <section class="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-4 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
                <div class="mb-2 flex items-center gap-2">
                  <AnimatedIcon icon={Briefcase} size={16} color="text-brand-teal" animationType="none" ariaLabel="Role type" />
                  <p class="text-sm uppercase tracking-[0.14em] text-slate-500">{item.title}</p>
                </div>
                <h3 class="text-2xl font-semibold text-brand-ink break-words">{item.role}</h3>
                <p class="text-slate-700">{item.company}</p>

                <ul class="mt-4 space-y-2 text-slate-700">
                  {item.bullets.map((bullet) => (
                    <li class="flex gap-3 leading-relaxed">
                      <AnimatedIcon icon={ArrowRight} size={16} color="text-brand-teal" animationType="none" className="mt-0.5 flex-shrink-0" />
                      <span class="break-words">{bullet}</span>
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

Replace it with:

```astro
    <section class="space-y-4">
      <SectionHeader
        title="Experience"
        subtitle="Roles and work history that shaped my software, automation, and operations background."
      />
      <ExperienceTimeline client:visible experiences={experiences} />
    </section>
```

- [ ] **Step 5: Add the import and remove now-unused ones**

Add to the frontmatter's import block:

```javascript
import ExperienceTimeline from '../components/islands/ExperienceTimeline.jsx'
```

Then check whether `AnimatedIcon` and `{ ArrowRight, Briefcase }` (from `'../components/icons/icons.js'`) are still used anywhere else in `profile.astro` after Step 4's replacement — they were only used by the inline Experience markup just removed. If nothing else in the file references them, remove their now-unused import lines:

```javascript
import AnimatedIcon from '../components/icons/AnimatedIcon.jsx'
import { ArrowRight, Briefcase } from '../components/icons/icons.js'
```

(Check the exact current import line for `AnimatedIcon.jsx` and `icons.js` before removing — confirm no other section of `profile.astro` still needs them before deleting the lines.)

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 7: Verify visually, including scroll-reveal**

`npm run build && npm run preview -- --port 4173`, open `/profile`. Confirm:
- The center line, dot, and date pill render exactly as before.
- Each card shows title tag, role, company, a one-line teaser (first bullet, truncated if long), and a "View details →" link.
- Clicking "View details" opens the modal with the full bullet list; Escape and clicking the backdrop both close it; the arrow icon slides on hover of the link.
- Scrolling the Experience section into view still triggers the fade/slide-in reveal on each row (confirms the `initScrollReveal()` finding from this plan's Global Constraints holds in practice, not just in theory).
- `page.emulateMedia({ reducedMotion: 'reduce' })` still works (existing CSS-only reduced-motion handling for the reveal transition is untouched — this plan doesn't add any new motion).

Stop the preview server when done.

- [ ] **Step 8: Commit**

```bash
git add src/pages/profile.astro src/components/ExperienceDetailModal.jsx src/components/islands/ExperienceTimeline.jsx
git commit -m "feat: convert Experience rows into compact cards with a full-detail modal"
```

---

## Self-Review Notes

- **Spec coverage:** all 5 sections of the design spec map 1:1 to Task 1-5 above.
- **Type/interface consistency:** `ExperienceTimeline`'s `experiences` prop shape matches exactly what `profile.astro` already computes (`const experiences = profileContent.experiences || []`) and what `ExperienceDetailModal`'s `experience` prop expects (same object shape, one item instead of an array) — no drift.
- **No placeholders:** every task's code blocks are complete and copy-pasteable; the two "verify at implementation time" notes (scroll-reveal behavior, and confirming no other `profile.astro` section still needs the `AnimatedIcon`/`ArrowRight`/`Briefcase` imports before deleting them) are genuine verification steps with a stated expected outcome, not unresolved TBDs.
