# Profile Page Content & Structure Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Profile page's "everything is an identical white box" structural problems (dead-end control, timeline badge overlap, a disconnected-looking Portfolio carousel) and refresh its content to match the real resume (`src/assets/documents/Stephen_Rey_Agustinez_Resume.pdf`), per `docs/superpowers/specs/2026-08-11-profile-page-polish-design.md`.

**Architecture:** Six independently-shippable tasks. Two (Hero/About restructure, Experience) touch the D1-backed content layer; the rest are presentation-only. Every content change updates both the D1-facing seed (`scripts/cms/seed/cms-content-seed.sql`) and its matching static fallback file in the same task, per the spec's Data Layer table.

**Tech Stack:** Astro 7, React 19 islands, Tailwind CSS, Cloudflare D1 (via `@astrojs/cloudflare`), `simple-icons` (vendored SVGs, devDependency).

## Global Constraints

- TypeScript files: explicit types on exported functions/interfaces; no `any`. `.jsx` files: JSDoc prop types matching this repo's existing convention (see `src/components/ResponsivePicture.jsx`).
- Immutability: spread-based updates, never mutate in place.
- No `console.log` in committed code (except the pre-existing, already-accepted exception in `scripts/copy-tool-logos.mjs`).
- Commit format: `<type>: <description>` (conventional commits).
- Verify every task with `npm run typecheck && npm run build`. For anything touching D1 content, also verify with `npm run build && npm run preview` against **local** D1 (`npx wrangler d1 migrations apply devlab-studios-cms --local` first if needed, then `npx wrangler d1 execute devlab-studios-cms --local --file=scripts/cms/seed/cms-content-seed.sql` to load the updated seed) — confirmed in this session that local D1 starts genuinely empty (no migrations-applied seed), so this apply step is required to see real content in local preview, not optional.
- **This session has no working Cloudflare credentials for remote D1** (confirmed: `wrangler d1 execute --remote` fails with an authentication error here). No task should attempt a `--remote` D1 command. Every content task's final step is a documented, copy-pasteable command for the human maintainer to run against production themselves (`npx wrangler d1 execute devlab-studios-cms --remote --file=scripts/cms/seed/cms-content-seed.sql`) — write it in the report, do not attempt to run it.
- `scripts/cms/seed/cms-content-seed.sql` uses `DELETE FROM <table>; INSERT INTO <table> (...) VALUES (...) ...;` for relational tables (experiences, etc.) and `INSERT INTO site_settings (...) VALUES (...) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;` for the JSON-blob singletons (`profile_about`, etc.) — match whichever pattern the section you're editing already uses; do not introduce a third pattern.
- Windows dev note: `npm run dev` may crash with an unrelated Miniflare/workerd bug seen in this project before — always verify via `npm run build && npm run preview`, not `npm run dev`. Kill any preview/dev server or browser process you start before finishing — don't leave node.exe processes running.
- **Verified facts, not assumptions — read before doubting these:**
  - `src/data/experiences.js` and `scripts/cms/seed/cms-content-seed.sql` **already contain all 4 correct experience entries** (verified by direct read in this session) — freelance AI Automation Specialist, Accenture ("Custom Software Engineer Associate (Java)", note: differs in phrasing from the resume's "Full-Stack Developer" — this is an intentional, already-existing discrepancy between two real sources; do not "fix" one to match the other), Process Engineer I, Manufacturing Engineer I. The live production page showing only one entry is a **data-sync gap** (this content was written into these files but apparently never applied to the actual D1 database), not a missing-content problem. Task 3 reflects this — it is a verification/sync task, not a content-authoring task.
  - `certificatesAndLicenses` lives inside the `profile_about` JSON blob as `string[]`, **not** the D1 `certifications` table (that table only holds 4 unrelated platform-training badges — Zapier/Make/n8n/HighLevel — rendered by the separate `CertificationsGallery.jsx`). Verified via `migrations/0005_seed_certifications.sql` and `src/data/about.js`.
  - Local D1's `profile_about` site_setting row currently exists but is an empty `{}` — confirmed by direct query in this session. Don't assume local D1 has any real content already; the seed file must be applied.

## File Structure

| File | Responsibility |
|---|---|
| `src/data/about.js` | Static fallback: About text (merged), `certificatesAndLicenses` (restructured) |
| `src/lib/content/profile.ts` | `ProfileContentData`-equivalent interfaces: `careerObjectives`+`shortBio` → `about`; `certificatesAndLicenses: string[]` → structured array |
| `src/components/admin/ContentManager.jsx` | Admin form: two textareas → one; certifications sub-form restructured |
| `scripts/cms/seed/cms-content-seed.sql` | `profile_about` JSON literal updated to match |
| `src/components/PersonalInfoCard.jsx` | Rewritten as the sidebar identity panel (photo/name/title/status/location/email), or replaced — implementer's call at Task 2, see that task |
| `src/pages/profile.astro` | Top section restructured: sidebar + document flow (About → Education → Certifications) |
| `src/components/ui/CertificationLogo.jsx` (new, small) | Issuer-name → vendored-logo lookup, used by the Certifications document-flow block |
| `src/assets/tool-logos/cisco.svg`, `owasp.svg` (new) | Vendored via the same `scripts/copy-tool-logos.mjs` pipeline; `google.svg` already exists and is reused |
| `src/components/[Experience timeline markup in profile.astro]` | Badge sizing fix only |
| `src/components/ui/SystemsPanel.jsx` | Expand/collapse toggle for both truncated lists |
| `src/components/islands/PortfolioGallery.jsx` | Remove dark wrapper background; narrow `--center-scale` range; drop opacity/blur from `applyCenterFocus` |
| `src/components/PortfolioCard.jsx` | Restyle to light/flat card matching cert cards |
| `src/data/projectRecords.js` | "Automated Lead Qualification" description enriched |
| `scripts/cms/generate-project-seed.mjs` / `scripts/cms/seed/project-seed.sql` | Regenerated from `projectRecords.js` after the description change |
| `scripts/copy-tool-logos.mjs` | 13 new `LOGO_SLUGS`/`LOGO_COLORS` entries |
| `src/data/tools.js` | 13 new `coreTools` entries |

---

## Task 1: Data layer — merge About, restructure Certificates & Licenses

**Files:**
- Modify: `src/data/about.js`
- Modify: `src/lib/content/profile.ts`
- Modify: `src/components/admin/ContentManager.jsx`
- Modify: `scripts/cms/seed/cms-content-seed.sql`

**Interfaces:**
- Produces: `aboutData.about: string` (replaces `.careerObjectives`/`.shortBio`), `aboutData.certificatesAndLicenses: Array<{ name: string, issuer: string | null, date: string | null }>` (replaces `string[]`). Task 2 consumes both.

- [ ] **Step 1: Read the current shape yourself first**

Read `src/data/about.js`, `src/lib/content/profile.ts` (search for `careerObjectives`, `shortBio`, `certificatesAndLicenses`), `src/components/admin/ContentManager.jsx` (same search terms), and `scripts/cms/seed/cms-content-seed.sql` (search for `profile_about`). Confirm the four files agree on today's shape before changing anything — this plan was written against a snapshot of these files; if any has drifted, that's a real signal to stop and report `NEEDS_CONTEXT` rather than guess.

- [ ] **Step 2: Update `src/data/about.js`**

Replace the `careerObjectives`/`shortBio` fields with a single `about` field:

```javascript
about:
  "AI Automation Architect and full-stack developer specializing in n8n workflow architecture, AI agents, and REST API integrations. I build end-to-end systems that validate data, apply business rules, connect third-party platforms, and route high-value cases for human review — with a full-stack foundation in React, Java, Spring Boot, and SQL.",
```

Also update the `role`/`professionalTitle` field (whatever it's actually named in this file — check Step 1's read) from its current value to:

```javascript
"AI Automation Architect & Software Engineer"
```

Restructure `certificatesAndLicenses` from `string[]` to structured objects:

```javascript
certificatesAndLicenses: [
  { name: "CCNA: Enterprise Networking, Security, and Automation", issuer: "Cisco", date: "June 2022" },
  { name: "Google Technical Support Fundamentals", issuer: "Google", date: "February 2023" },
  { name: "Introduction to Cybersecurity Tools & Cyber Attacks", issuer: null, date: "September 2020" },
  { name: "Using Google Forms to Analyze User Research Data", issuer: null, date: "2020" },
  { name: "OWASP Top 10: Securing Web Applications", issuer: "OWASP", date: "2025" },
  { name: "CCSP 2019: Identity & Access Management", issuer: null, date: "June 2025" },
  { name: "CCSP 2019: Application Development & Security", issuer: null, date: "June 2025" },
],
```

(`issuer: null` is intentional for the four entries with no unambiguous issuer in the original text — do not guess an issuer for these.)

- [ ] **Step 3: Update `src/lib/content/profile.ts`**

Find the interface with `careerObjectives?: string`, `shortBio?: string`, and the `certificatesAndLicenses` type. Replace with:

```typescript
about?: string
// ...
certificatesAndLicenses?: Array<{ name: string; issuer: string | null; date: string | null }>
```

Remove the now-unused `careerObjectives?: string` and `shortBio?: string` lines. Search the whole file for any other reference to these two fields or to `certificatesAndLicenses` and update each one — do not leave a partial rename.

- [ ] **Step 4: Update `src/components/admin/ContentManager.jsx`**

Find the admin form fields for "Career Objectives" and "Short Bio" (search for `careerObjectives`/`shortBio`) and collapse them into a single "About" textarea bound to the `about` field. Find the Certificates & Licenses admin input (search for `certificatesAndLicenses`) — it's currently editing a flat string list; change it to edit the three sub-fields (name, issuer, date) per entry, following whatever list-editing UI pattern this file already uses for other array-of-object fields (e.g. Education or Experience bullets) rather than inventing a new one.

- [ ] **Step 5: Update `scripts/cms/seed/cms-content-seed.sql`**

Find the `profile_about` JSON literal (search for `'profile_about'`). Replace the `"careerObjectives":"..."` and `"shortBio":"..."` keys with a single `"about":"..."` key (the same text from Step 2, JSON-escaped), update the `"role"` value to match Step 2's title change, and replace the `"certificatesAndLicenses":[...]` array of strings with the array of `{name, issuer, date}` objects from Step 2 (JSON-escaped, same content). This file is one long SQL string literal — be careful with quote escaping; after editing, validate the JSON is well-formed before saving (e.g. extract just that JSON substring and run it through `JSON.parse` mentally or via a quick Node one-liner).

- [ ] **Step 6: Verify against local D1**

```bash
npx wrangler d1 execute devlab-studios-cms --local --file=scripts/cms/seed/cms-content-seed.sql
npm run build && npm run preview -- --port 4173
```

Open `/profile` and confirm the About text and certificates render correctly from the database (not just the static fallback — this is the point of applying the seed locally). Stop the preview server when done.

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/data/about.js src/lib/content/profile.ts src/components/admin/ContentManager.jsx scripts/cms/seed/cms-content-seed.sql
git commit -m "feat: merge About text, restructure Certificates & Licenses with issuer field"
```

In your report, include the exact command for the human maintainer to apply this to production: `npx wrangler d1 execute devlab-studios-cms --remote --file=scripts/cms/seed/cms-content-seed.sql`. Do not run it yourself — this session has no working remote credentials.

---

## Task 2: Hero/About restructure — sidebar identity + document flow

**Files:**
- Modify: `src/components/PersonalInfoCard.jsx` (or replace — see Step 1)
- Modify: `src/pages/profile.astro`
- Create: `src/components/ui/CertificationLogo.jsx`
- Create: `src/assets/tool-logos/cisco.svg`, `src/assets/tool-logos/owasp.svg`

**Interfaces:**
- Consumes: `aboutData.about`, `aboutData.certificatesAndLicenses` (Task 1's new shape — this task cannot start until Task 1 is complete).
- Produces: `<CertificationLogo issuer={string | null} />` — renders a small logo `<img>` for a known issuer, or nothing/a generic fallback icon for `null` or an unmapped issuer.

- [ ] **Step 1: Read the current layout**

Read `src/pages/profile.astro`'s top section (hero card, the Career-Objectives/Short-Bio card pair, and the Education/Achievements/Certificates card row) and `src/components/PersonalInfoCard.jsx` in full before writing any code — this plan does not reproduce their current content, since Task 1 already changed the underlying data shape they'll need to consume. Decide, based on what you read, whether to modify `PersonalInfoCard.jsx` in place to become the sidebar identity panel, or replace it with a new component and delete the old one — either is acceptable as long as the end result matches Step 2's layout and nothing dangling remains (no orphaned unused component, no broken import).

- [ ] **Step 2: Build the layout**

Sidebar (sticky at `lg` breakpoint and up, stacked above the content on smaller screens): photo, name, title (`aboutData.role`/`professionalTitle`, now "AI Automation Architect & Software Engineer" per Task 1), the existing "Available for..." status pill, then a hairline-bordered meta block with location, email, and LinkedIn (`aboutData.linkedinUrl` if present — check Step 1's read for the exact field name; if it doesn't exist as a field yet, omit the LinkedIn line rather than inventing a new data field in this task).

Document flow (to the sidebar's right, separated by a hairline vertical border, no card/shadow chrome): three blocks separated by a hairline horizontal border or generous spacing (match whichever the earlier-approved mockup used) —
1. **About** — `aboutData.about`, one paragraph, section label "About".
2. **Education** — existing education list content, same data as today, restyled to fit the document-flow list pattern (small caps section label, then each entry as program/school/years, no separate card).
3. **Certifications** — `aboutData.certificatesAndLicenses.map(...)`, each entry showing `<CertificationLogo issuer={cert.issuer} />` beside `cert.name` (small text) and `cert.date` (smaller, muted text below or beside the name).

Do not carry over the "Achievements & Responsibilities" card's current position/treatment without deciding where it goes — read Step 1's exploration to confirm whether it stays as a fourth document-flow block (recommended, for consistency) or is dropped; if you're unsure, keep it as a fourth block rather than silently removing user content.

- [ ] **Step 3: Build `CertificationLogo.jsx`**

```jsx
// src/components/ui/CertificationLogo.jsx
import ciscoLogo from '../../assets/tool-logos/cisco.svg'
import googleLogo from '../../assets/tool-logos/google.svg'
import owaspLogo from '../../assets/tool-logos/owasp.svg'
import { BadgeCheck } from '../icons/icons'

const ISSUER_LOGOS = {
  Cisco: ciscoLogo,
  Google: googleLogo,
  OWASP: owaspLogo,
}

/**
 * @param {{ issuer: string | null }} props
 */
function CertificationLogo({ issuer }) {
  const logo = issuer ? ISSUER_LOGOS[issuer] : null
  if (logo) {
    return <img src={logo} alt="" width={20} height={20} className="h-5 w-5 flex-shrink-0" />
  }
  return <BadgeCheck className="h-5 w-5 flex-shrink-0 text-brand-teal" aria-hidden="true" />
}

export default CertificationLogo
```

(Verify `../icons/icons` actually exports `BadgeCheck` — it's already used elsewhere on this page per the spec's "Current State" notes; if the import path or export name differs, use whatever this codebase's existing convention is instead of guessing.)

- [ ] **Step 4: Vendor the two new logo SVGs**

Read `scripts/copy-tool-logos.mjs` in full first — Task 6 (marquee expansion) will also touch this file later, so keep your change additive and minimal (don't restructure the script). Add `cisco` and `owasp` to its `LOGO_SLUGS` map (`cisco: 'cisco'`, `owasp: 'owasp'`) and, if the script already has a `LOGO_COLORS`-style fill-injection step (added in the previous redesign round for the marquee), add their hex values too: Cisco `#1BA0D7`, OWASP `#000000`. Run `node scripts/copy-tool-logos.mjs` and confirm `src/assets/tool-logos/cisco.svg` and `owasp.svg` now exist with the expected fill color. `google.svg` already exists from the earlier marquee work — do not re-vendor it, just import the existing file in Step 3.

- [ ] **Step 5: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`. Confirm: sidebar sticks on desktop width, stacks above content on mobile width, About text reads correctly, Education/Certifications render as a flowing document (no card boxes), Cisco/Google/OWASP certifications show their logo, the four `issuer: null` certifications show the fallback icon (or no icon, per your Step 3 choice) without looking broken. Stop the preview server when done.

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/PersonalInfoCard.jsx src/pages/profile.astro src/components/ui/CertificationLogo.jsx src/assets/tool-logos/cisco.svg src/assets/tool-logos/owasp.svg scripts/copy-tool-logos.mjs
git commit -m "feat: rebuild profile hero/about as sidebar identity + document flow with cert logos"
```

---

## Task 3: Experience — sync the already-correct data to the database, fix the badge

**Files:**
- Modify: `src/pages/profile.astro` (badge CSS/markup only)

**Interfaces:** None — self-contained.

**Important context (verified, do not re-derive):** `src/data/experiences.js` and `scripts/cms/seed/cms-content-seed.sql` already contain the complete, correct 4-entry experience history (freelance AI Automation Specialist, Accenture, Process Engineer I, Manufacturing Engineer I). This task does not author any new experience content. It (a) fixes a real CSS bug in the timeline badge, and (b) applies the already-correct seed to local D1 so the fix can be verified against 4 real entries instead of the empty local database's current state.

- [ ] **Step 1: Read the current Experience section**

Read `src/pages/profile.astro`'s Experience timeline markup (the year-badge → dot-on-line → card structure) in full. Identify the exact class(es) responsible for the badge's box model (width, padding, line-height, `white-space`) — this is what needs fixing, not the surrounding grid/line/dot structure.

- [ ] **Step 2: Fix the badge**

Adjust the badge's sizing so date-range strings up to at least "September 2024 – Present" (the longest current one) and "June 2025 – June 2026" / "September 2024 – June 2025" (the newly-visible ones once the data syncs) render without wrapping into the connector line or dot at any width this site supports. Concretely: ensure the badge has enough `min-width` or the year-badge grid column is wide enough, and that `white-space: nowrap` (or an explicit two-line layout with controlled `line-height` and vertical centering against the dot) is used deliberately rather than left to wrap unpredictably. Read the current Tailwind classes on the badge before changing them — this is a sizing fix, not a redesign of the badge's appearance (color, shape, gradient stay as they are).

- [ ] **Step 3: Apply the existing seed to local D1 and verify**

```bash
npx wrangler d1 execute devlab-studios-cms --local --file=scripts/cms/seed/cms-content-seed.sql
npm run build && npm run preview -- --port 4173
```

Open `/profile`, scroll to Experience, confirm all 4 entries render, and confirm the badge fix holds for every entry's date range at desktop and mobile widths (use browser DevTools device emulation, or check across the Playwright projects' viewport sizes if you write a throwaway verification test). Stop the preview server when done.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/profile.astro
git commit -m "fix: prevent experience timeline badge from overlapping the connector line"
```

In your report, note explicitly: (a) no experience content was added because it already existed correctly in `experiences.js`/`cms-content-seed.sql`, and (b) the exact command for the human maintainer to sync production D1 to this already-correct content: `npx wrangler d1 execute devlab-studios-cms --remote --file=scripts/cms/seed/cms-content-seed.sql` (same file Task 1 also asks to be applied to production — if both tasks are done, one production apply covers both).

---

## Task 4: Systems & Workflows — real expand/collapse

**Files:**
- Modify: `src/components/ui/SystemsPanel.jsx`

**Interfaces:** None — self-contained, no prop changes, no data changes.

- [ ] **Step 1: Read the current truncation logic**

Read `SystemsPanel.jsx` in full. Find where Workflow Patterns and System Characteristics are sliced/truncated and where the `+N additional ...` text is rendered.

- [ ] **Step 2: Add expand/collapse state**

Add two independent pieces of local state (e.g. `useState(false)` each) — one for Workflow Patterns expanded/collapsed, one for System Characteristics. Render the full list when expanded, the truncated list when collapsed. Replace the static `+N additional workflow pattern(s)` / `+N additional characteristic(s)` text with a clickable control (`<button type="button">`) that toggles its corresponding state and reads "+N more" when collapsed, "Show less" when expanded. Keep both lists' existing item markup unchanged — only the truncation/toggle behavior changes.

- [ ] **Step 3: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Systems & Workflows. Confirm clicking "+N more" reveals the rest of that specific list in place, clicking "Show less" collapses it back, and the other list's toggle state is unaffected by the first. Stop the preview server when done.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/SystemsPanel.jsx
git commit -m "feat: make Systems & Workflows +N more a real expand/collapse toggle"
```

---

## Task 5: Portfolio — de-glassmorphize, enrich the lead-qualification description

**Files:**
- Modify: `src/components/islands/PortfolioGallery.jsx`
- Modify: `src/components/PortfolioCard.jsx`
- Modify: `src/data/projectRecords.js`
- Regenerate: `scripts/cms/seed/project-seed.sql` (via existing script)

**Interfaces:** None — no prop/type changes, styling and one project's description text only.

- [ ] **Step 1: Read the current carousel styling**

Read `PortfolioGallery.jsx`'s `applyCenterFocus` function and the `.portfolio-carousel-wrap` / slide wrapper markup, and `PortfolioCard.jsx` in full.

- [ ] **Step 2: Strip the glassmorphic treatment**

In `PortfolioGallery.jsx`: remove the `bg-slate-950/20` (or whatever the current dark-wrapper class is) from the carousel wrap div. In `applyCenterFocus`: stop writing `slideNode.style.opacity` and `slideNode.style.filter` entirely (delete those two lines) — keep the `--center-scale` custom-property write, but narrow its formula from `1 - normalized * 0.1` to `1 - normalized * 0.04`.

In `PortfolioCard.jsx`: change the card's background/text classes from the current dark treatment (`bg-slate-950/40`, white text) to match the certification cards' light surface — read `CertificationsGallery.jsx`'s card classes first and reuse the same background/border/shadow/text-color convention rather than inventing new values, so the two card types are visually consistent.

- [ ] **Step 3: Enrich the "Automated Lead Qualification" project description**

In `src/data/projectRecords.js`, find the project titled "Automated Lead Qualification" (or matching id). Replace its `description` field with:

```javascript
description:
  "A three-workflow closed-loop system for real estate lead qualification: scheduled intake normalizes and deduplicates leads before dispatching authenticated outbound AI voice calls via Retell, inbound caller lookup matches phone numbers back to lead records, and post-call webhook processing analyzes transcripts, updates records, and routes qualified opportunities to human acquisitions handoff — with API response validation, failure routing, and monitoring throughout.",
```

Keep the existing `techStack` array as-is unless it's missing something this description now implies (e.g. if "Retell AI" isn't already listed, add it) — check before changing.

- [ ] **Step 4: Regenerate the project seed**

```bash
npm run cms:seed:projects
```

Confirm this updates `scripts/cms/seed/project-seed.sql` with the new description (diff it — the command overwrites the whole file, so confirm only the expected project's description line changed, not an unrelated reformatting of the whole file).

- [ ] **Step 5: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Portfolio. Confirm: every visible carousel card has identical, flat, light styling (no dark wrapper, no blur, no opacity dip on off-center cards), a subtle scale still distinguishes the centered card, autoplay/hover-pause/manual arrows/category tabs still work (this task doesn't touch that logic, but confirm nothing broke), and the "Automated Lead Qualification" project's modal shows the new description. Stop the preview server when done.

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/islands/PortfolioGallery.jsx src/components/PortfolioCard.jsx src/data/projectRecords.js scripts/cms/seed/project-seed.sql
git commit -m "fix: flatten portfolio carousel styling, enrich lead-qualification project description"
```

Note in your report the command for the human maintainer to sync production's `projects` table, if this project also lives in the live D1 (check `scripts/cms/seed/project-seed.sql`'s own header comment for the correct apply command — likely `npx wrangler d1 execute devlab-studios-cms --remote --file=scripts/cms/seed/project-seed.sql`, but confirm against that file's actual documented usage rather than assuming it matches `cms-content-seed.sql`'s pattern exactly).

---

## Task 6: Tools & Platforms marquee — add 13 resume tools

**Files:**
- Modify: `scripts/copy-tool-logos.mjs`
- Modify: `src/data/tools.js`

**Interfaces:** None — `coreTools` shape (`{ key, label, icon, logo? }`) is unchanged, just more entries.

**Context:** purely static, code-level content — no D1 involvement, per explicit decision in the design spec. If Task 2 already ran, `scripts/copy-tool-logos.mjs` will already have `cisco`/`owasp` added to its maps — add this task's entries alongside those, don't remove or restructure what Task 2 added.

- [ ] **Step 1: Read the current script and data file**

Read `scripts/copy-tool-logos.mjs` and `src/data/tools.js` in full — confirm the exact current `LOGO_SLUGS`/`LOGO_COLORS` (if present) structure and the `coreTools` array's exact field order/style before adding to either.

- [ ] **Step 2: Add the new logo slugs**

Add to `LOGO_SLUGS` (and the fill-color map, if the script has one from the previous round):

```javascript
claude: 'claude',       // #D97757
postman: 'postman',     // #FF6C37
springboot: 'springboot', // #6DB33F
nextjs: 'nextdotjs',    // #000000
typescript: 'typescript', // #3178C6
javascript: 'javascript', // #F7DF1E
git: 'git',             // #F03C2E
vercel: 'vercel',       // #000000
php: 'php',             // #777BB4
java: 'openjdk',        // #000000 (closest available substitute, not Java's actual logo)
```

(Adjust the exact key names to whatever naming convention `LOGO_SLUGS` already uses — e.g. if existing keys are the tool's display name in lowercase like `react`, `tailwind`, follow that, not necessarily the literal names above.)

Run `node scripts/copy-tool-logos.mjs` and confirm the 10 new SVG files appear in `src/assets/tool-logos/` with correct fill colors (spot-check 2-3).

- [ ] **Step 3: Add the 13 new `coreTools` entries**

Add entries to `src/data/tools.js`'s `coreTools` array (10 with real logos from Step 2, 3 with a generic icon and no `logo` field):

```javascript
{ key: 'claude', label: 'Claude', icon: 'Sparkles', logo: claudeLogo },
{ key: 'postman', label: 'Postman', icon: 'Send', logo: postmanLogo },
{ key: 'springboot', label: 'Spring Boot', icon: 'Leaf', logo: springbootLogo },
{ key: 'nextjs', label: 'Next.js', icon: 'Code2', logo: nextjsLogo },
{ key: 'typescript', label: 'TypeScript', icon: 'Code2', logo: typescriptLogo },
{ key: 'javascript', label: 'JavaScript', icon: 'Code2', logo: javascriptLogo },
{ key: 'git', label: 'Git', icon: 'GitBranch', logo: gitLogo },
{ key: 'vercel', label: 'Vercel', icon: 'Triangle', logo: vercelLogo },
{ key: 'php', label: 'PHP', icon: 'Code2', logo: phpLogo },
{ key: 'java', label: 'Java', icon: 'Coffee', logo: javaLogo },
{ key: 'retellai', label: 'Retell AI', icon: 'Phone' },
{ key: 'twilio', label: 'Twilio', icon: 'MessageSquare' },
{ key: 'sql', label: 'SQL / Databases', icon: 'Database' },
```

(Add the matching `import <name>Logo from '../assets/tool-logos/<key>.svg?url'` lines at the top of the file for each of the 10 real-logo entries — check the file's existing import style, since the last redesign round found plain SVG imports resolve to `ImageMetadata` objects in this project and require the `?url` suffix to work as `logo: string`. Verify every Lucide icon name used above — `Sparkles`, `Send`, `Leaf`, `GitBranch`, `Triangle`, `Coffee`, `Phone`, `MessageSquare`, `Database` — actually exists in this project's icon set (`src/components/icons/icons.js` or wherever `ToolsMarquee`'s `resolveIcon` looks up icons) before using it; substitute an existing, reasonably-matching icon name if any of these aren't available rather than guessing blindly.)

- [ ] **Step 4: Verify visually**

`npm run build && npm run preview -- --port 4173`, open `/profile`, scroll to Tools & Platforms. Confirm the marquee now shows 29 total logos scrolling smoothly across its two rows, the 10 new real logos render in their correct brand colors, and the 3 generic-icon entries (Retell AI, Twilio, SQL/Databases) render their fallback icon without looking broken. Stop the preview server when done.

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors.

- [ ] **Step 6: Run the existing e2e suite**

```bash
npx playwright test image-weight --project=static
```

The marquee logos are inlined as data URIs (confirmed in the previous redesign round — they don't count toward this budget), so adding 10 more should not affect this test, but confirm it still passes rather than assuming.

- [ ] **Step 7: Commit**

```bash
git add scripts/copy-tool-logos.mjs src/data/tools.js src/assets/tool-logos/
git commit -m "feat: add 13 resume tools to the Tools & Platforms marquee"
```

---

## Self-Review Notes

- **Spec coverage:** all 5 numbered sections of the design spec map to tasks: §1 (Hero/About restructure) → Task 2 (+ Task 1 for its data dependency), §2 (Experience) → Task 3, §3 (Systems & Workflows) → Task 4, §4 (Portfolio) → Task 5, §5 (Certifications + marquee) → Task 2 (cert logos) + Task 6 (marquee).
- **Corrections made during planning that the spec's first draft got wrong:** (1) the spec originally assumed the CCNA/Google/OWASP certifications were backed by the D1 `certifications` table with an existing `issuer` column — verified false by reading `migrations/0005_seed_certifications.sql` directly; corrected to reflect the real `certificatesAndLicenses: string[]` field inside `profile_about`, which this plan's Task 1 restructures. (2) The spec (and this plan's own first draft) assumed the 3 "missing" experience entries needed to be authored from the resume — verified false by reading `src/data/experiences.js` and `scripts/cms/seed/cms-content-seed.sql` directly, both of which already contain all 4 correct entries; Task 3 was rewritten to a data-sync-and-verify task instead of a content-authoring task.
- **Type/interface consistency:** Task 1's `about`/`certificatesAndLicenses` shape change is consumed identically by Task 2 — no drift introduced.
- **No placeholders:** every task's code blocks are complete; the two spots requiring the implementer to verify against the live file first (Lucide icon names in Task 6, the JSON escaping in Task 1) are flagged as verification steps, not left as unresolved TBDs.
