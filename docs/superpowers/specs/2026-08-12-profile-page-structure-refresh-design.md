# Profile Page Structure Refresh — Design Spec

## Goal

Second follow-up to the Profile page work (2026-08-06 redesign, 2026-08-11 content/structure polish). Directed by brittanychiang.com as a structural reference (compact, document-flow experience entries; no redundant boxing), this round: merges the two disconnected certification lists into one, converts Experience rows into compact, click-to-expand entries, removes two now-dead/blank sections, widens the Tools & Platforms marquee to four slower rows, and makes the Portfolio carousel's edges fade seamlessly into the page instead of ending in a hard `overflow: hidden` clip.

This spec was validated interactively via the brainstorming visual-companion tool for the three genuinely visual decisions (certifications layout, experience row/modal, portfolio fade) — each was shown as two live mockup options and approved before being written down here.

## Current State

- **Certifications (split across two disconnected places):** `profile.astro`'s sidebar/document-flow area renders a small text+logo list from `aboutData.certificatesAndLicenses` (CCNA, Google, OWASP, CCSP entries — logo or `BadgeCheck` fallback via `CertificationLogo.jsx`, no images). Separately, a full-width "Platform Certifications" section further down renders `CertificationsGallery.jsx` — a 4-column grid of real badge images (Zapier/Make/n8n/HighLevel) with hover-reveal issuer/date and click-to-enlarge (`ImageModal`). Two headings, two visual languages, for what a visitor reads as one concept ("things I'm certified in").
- **Experience:** left-rail timeline (year-badge → dot-on-line → card) in `profile.astro`, static Astro markup (no client JS). Each card shows title tag, role, company, and the *full* bullet list inline — cards can run long (the Accenture/ONSEMI entries have 5-7 bullets each).
- **Skills:** `SkillsSection.jsx`, rendered in `profile.astro` right after Experience. Reads `profileContent.skills.technical/personal`, both permanently empty in every data source (D1 and static fallback) — renders a "Skills" heading with two empty sub-headings and no content. Dead weight on the page.
- **Systems & Workflows:** `SystemsPanel.jsx`, rendered near the bottom. Two lists (Workflow Patterns, System Characteristics) with a real expand/collapse toggle (added last round). Functional, but the user has decided this section doesn't belong on the page.
- **Tools & Platforms marquee:** `ToolsMarquee.jsx`, 2 rows (29 tools split ~15/14), fixed-duration CSS animation (32s/36s), edge fade via `mask-image` into the marquee's own `#f5f7fb` panel background.
- **Portfolio carousel:** `PortfolioGallery.jsx`, Embla carousel, flat card styling (glassmorphism removed last round). `.portfolio-carousel-wrap` has no background of its own — cards are simply clipped by `overflow: hidden` at a fixed `max-w-[900px]`, so off-center cards end abruptly at the container's edge rather than fading.

## Component Designs

### 1. Certifications — one heading, two labeled groups

**Modified:** `src/pages/profile.astro`

Remove the standalone "Platform Certifications" `<SectionHeader>` block (lines ~89-97 today) entirely. Inside the existing sidebar/document-flow "Certifications" block, add a second labeled sub-group below the existing `certificatesAndLicenses` list:

```
CERTIFICATIONS
  Professional
    [logo] CCNA: Enterprise Networking... · June 2022
    [logo] Google Technical Support Fundamentals · Feb 2023
    ... (existing certificatesAndLicenses rendering, unchanged, just under a "Professional" sub-label)
  Platform Training
    <CertificationsGallery certifications={certifications} />
```

- Add a small uppercase sub-label ("Professional") above the existing `certificatesAndLicenses.map(...)` list — same typographic treatment as the section labels already used (`text-xs font-semibold uppercase tracking-[0.16em] text-slate-500`), just nested one level.
- Add a second sub-label ("Platform Training") below it, then mount `<CertificationsGallery client:visible certifications={certifications} />` in place — same component, same props, same click-to-enlarge behavior, just relocated and no longer under its own `SectionHeader`/subtitle.
- `CertificationsGallery.jsx` itself is unchanged — its grid (`sm:grid-cols-2 lg:grid-cols-4`) fits comfortably inside the document-flow column width; no responsive rework needed.
- No data-model changes. Both data sources (`aboutData.certificatesAndLicenses`, `profileContent.certifications`) stay exactly as they are — this is a placement/grouping change only.
- If `certifications.length === 0`, don't render the "Platform Training" sub-label or gallery (mirrors today's existing `{certifications.length > 0 ? (...) : null}` guard, just moved inward instead of wrapping a whole separate section).

### 2. Experience — compact row + detail modal

**New file:** `src/components/ExperienceDetailModal.jsx`
**New file:** `src/components/islands/ExperienceTimeline.jsx` (the timeline becomes a React island so it can hold modal state)
**Modified:** `src/pages/profile.astro` (Experience section replaced with the new island)

- `profile.astro`'s current inline Experience markup (the `.map()` loop building year-badge/dot/card) moves into `ExperienceTimeline.jsx`, mounted via `<ExperienceTimeline client:visible experiences={experiences} />`. The badge/dot/connector-line markup, classes, and the `data-reveal`/`data-reveal-delay` scroll-in behavior are carried over unchanged — only the card's *content* changes shape.
- Card content becomes: title tag (unchanged) → role/company (unchanged) → **one-line teaser** (`item.bullets[0]`, truncated with `line-clamp-1` if needed) → a **"View details →"** link/button (`text-brand-teal font-semibold`, matching the site's existing link-accent convention) that calls `onSelect(item)`. The link is the only click target on the card — the card itself is not globally clickable, avoiding accidental-open on text selection.
- `ExperienceDetailModal.jsx` follows the exact convention already established by `ProjectDetailModal.jsx`: `{ experience, isOpen, onClose }` props, Escape-to-close, `document.body.style.overflow = 'hidden'` while open, same overlay/backdrop markup and close-button placement. Content: the title tag, role, company, and the *full* bullet list (existing `AnimatedIcon` + `ArrowRight` bullet styling, moved here verbatim from today's inline card).
- **Scroll-reveal risk, called out explicitly:** the shared `src/lib/scrollReveal.ts` `IntersectionObserver` watches `[data-reveal]` elements already present in the DOM. Converting this section to a `client:visible` island changes *when* those elements exist (React hydration on scroll-into-view, vs. server-rendered markup present at first paint). Verify during implementation that rows still reach `.reveal-visible` — if hydration timing races the observer, the fix is re-running (or not tearing down) the existing observer after hydration, not inventing a second reveal mechanism.

### 3. Remove Skills and Systems & Workflows (public page only)

**Deleted:** `src/components/ui/SkillsSection.jsx`, `src/components/ui/SystemsPanel.jsx`
**Modified:** `src/pages/profile.astro` (remove both imports and render blocks)

- Confirmed via `ContentManager.jsx`: both `profileContent.skills.{technical,personal}` and `profileContent.{workflowPatterns,systemCharacteristics}` have full admin editing UI, actively maintained independent of the public page. **Explicit decision: touch only the public page.** Admin CMS editors, D1 tables, and repository functions for both are left completely untouched — same precedent as the unused `tools`/`listTools` D1 path from the 2026-08-11 round. A future round can revisit the admin side.
- Delete the two component files outright (not just unmount) — no other file imports either component (verify at implementation time), so leaving them in place would be dead code per this project's established no-dead-code convention.

### 4. Tools & Platforms — four rows

**Modified:** `src/components/ui/ToolsMarquee.jsx`, `src/index.css`

- Split the 29 tools into 4 rows instead of 2 (~7-8 each) using the same even-split approach `ToolsMarquee.jsx` already uses for 2 rows, generalized to N rows.
- Alternate scroll direction per row (right, left, right, left) using the existing `tools-marquee-row--right`/`--left` classes — no new CSS keyframes needed, just two more rows using the classes that already exist.
- Give each row a distinct duration for a less mechanical, more organic feel: 30s / 34s / 38s / 42s (rows 1-4 respectively), replacing today's fixed 32s/36s pair. Same fixed-duration mechanism as today — fewer items per row over a comparable-or-longer duration is what produces the "slower" visual effect the user asked for; no other behavior changes (edge fade, grayscale-on-rest, hover-pause, reduced-motion handling all stay exactly as they are).

### 5. Portfolio carousel — seamless edge fade, no bounding box

**Modified:** `src/components/islands/PortfolioGallery.jsx`, `src/index.css`

**Explicit non-goal, stated after a mockup correction:** this is *not* the Tools marquee's technique verbatim — that component fades into its own solid `#f5f7fb` panel background. The Portfolio carousel wrapper must **not** gain a background color, border, or box-shadow of its own. The fade must reveal the page's own background directly, so nothing reads as a bounding box.

- Add `mask-image: linear-gradient(90deg, transparent, black 15%, black 85%, transparent)` (plus `-webkit-mask-image` for Safari) to `.portfolio-carousel-wrap` in `src/index.css`. This fades each card's own pixels to transparent as they approach the container edges — an alpha fade, not a fade-to-panel-color.
- No blur is added (per the 2026-08-11 round's explicit finding that per-card blur/opacity reads as a "dark, disconnected island" — confirmed again by the user this round after reviewing a reference screenshot that showed blur, and choosing the mask-only approach instead).
- Keep the existing `--center-scale` write in `applyCenterFocus` (the `1 - normalized * 0.04` formula) exactly as it is today — the subtle scale bump on the centered card stays as a second, complementary focus cue alongside the new edge fade. No changes to Embla wiring, autoplay, category tabs, or the windowed-image-loading logic.
- `prefers-reduced-motion`: unaffected — `mask-image` is static CSS with no animation of its own; the carousel's *autoplay* motion-gating is untouched.

## Data Flow

No changes to `loadProjects()`, `loadProfileContent()`, or any D1 read/write path. Every change in this round is presentation/composition — which components render where, and what a compact vs. expanded Experience row shows — not what data is fetched or how it's shaped. `profileContent.skills` and `profileContent.{workflowPatterns,systemCharacteristics}` keep being fetched by `loadProfileContent()` today (harmless if simply unused by the page after this round) — removing that fetch is out of scope, deferred to the future admin-side cleanup mentioned in §3.

## Error Handling

- Certifications: unchanged from today — `CertificationLogo`'s fallback icon for unmapped issuers, `CertificationsGallery`'s existing `certifications.length > 0` guard (now scoped to the "Platform Training" sub-label instead of a whole section).
- Experience: if `item.bullets` is empty (shouldn't happen with current data), the one-line teaser renders nothing rather than throwing — guard with `item.bullets?.[0]`.
- Portfolio: no new failure modes — CSS-only change.

## Testing

Same convention as the two prior rounds: `npm run typecheck && npm run build` after every task; `npm run build && npm run preview` for visual/interaction verification; throwaway Playwright specs (deleted after passing) for anything needing real browser confirmation (Experience modal open/close/Escape, scroll-reveal still firing on the now-client-hydrated timeline, certifications grouping renders both sub-groups, 4-row marquee renders all tools, portfolio edge fade doesn't clip/box). Re-run `tests/e2e/image-weight.spec.js` unmodified — none of these changes add or remove images.

## Non-Goals

- No color/theme changes — light background, purple/teal accents, all untouched.
- No data-model or D1 schema changes anywhere in this round.
- No admin CMS changes — Skills and Workflow Patterns/System Characteristics editors stay exactly as they are, per explicit decision (deferred to a later round).
- No changes to Embla carousel mechanics, autoplay, category tabs, or windowed image loading in Portfolio — styling/masking only.
- No re-introduction of per-card blur or opacity dimming in the Portfolio carousel — explicitly rejected this round.

## Implementation Notes for the Plan

Five independently-shippable pieces, same structure as the prior two rounds: (1) Certifications merge, (2) Experience compact row + modal (the only piece requiring a new React island + new modal component — highest risk, do this with care around the scroll-reveal interaction), (3) Skills/Systems removal (pure deletion, lowest risk, do first), (4) Tools 4-row split (small, isolated), (5) Portfolio edge fade (CSS-only, isolated). No cross-task dependencies.
