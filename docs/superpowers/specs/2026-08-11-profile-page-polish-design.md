# Profile Page Content & Structure Polish — Design Spec

## Goal

Follow-up to the 2026-08-06 Profile page redesign. That work fixed animation/interaction (marquee, hero polish, cert hover, timeline, carousel) but left the page reading as a stack of near-identical white rounded-corner-plus-shadow boxes, with several concrete defects: a non-interactive "+N more" dead end in Systems & Workflows, a date badge that visually collides with the Experience timeline's connector line, and a Portfolio carousel that looks like a dark, blurred island floating on the page rather than part of it. Separately, the page's actual content undersells the real person: three of four resume work-history entries are missing, the About copy is vaguer and more generic than the resume's own wording, and the Tools & Platforms marquee is missing over a dozen tools the resume names.

This round fixes both: the structural/visual defects, and a content refresh grounded in `src/assets/documents/Stephen_Rey_Agustinez_Resume.pdf`. It does **not** change the site's color palette or brand (light background, purple/teal accents stay) — see Non-Goals.

This spec was validated interactively via the brainstorming visual-companion tool — the hero/About restructure and the certifications/skills treatment were each demonstrated as live mockups and approved before being written down here.

## Current State (what exists today, as of the 2026-08-06 redesign)

- **Hero + About**: `PersonalInfoCard.jsx` (photo/name/title/status pill) followed by two side-by-side white cards in `profile.astro` — "Career Objectives" (`aboutData.careerObjectives`) and "Short Bio" (`aboutData.shortBio`) — largely redundant content in slightly different words. Below that, three more white cards in a row: Education, Achievements & Responsibilities, Certificates & Licenses (plain text list, no logos).
- **Experience**: left-rail timeline (year badge → dot-on-line → card) in `profile.astro`, sourced from `loadProfileContent().experiences`. Currently renders exactly one entry (the freelance AI Automation Architect role) because that's all `experiences` currently contains — not a rendering bug, a data gap.
- **Systems & Workflows**: `SystemsPanel.jsx` — Workflow Patterns and System Characteristics lists, each truncated to a handful of items with a `+N additional item(s)` text suffix that has no click handler.
- **Portfolio**: `PortfolioGallery.jsx` — Embla carousel on a `bg-slate-950/20` (dark, translucent) wrapper, cards fade/blur toward the edges via `applyCenterFocus`, `PortfolioCard.jsx` styled as a dark glassmorphic card (`bg-slate-950/40`, white text) — a deliberately different visual language than the rest of the light-themed page.
- **Tools & Platforms marquee**: `src/data/tools.js` — 16 entries (React, Tailwind, Vite, React Router, GitHub, Cloudflare Pages, Zapier, Make, n8n, Google, Notion, Airtable, API Integrations (generic), OpenAI (generic, no logo), GoHighLevel (generic, no logo), Astro). Static, vendored local SVGs via `scripts/copy-tool-logos.mjs` — no D1 backing, no CDN dependency, by original design.

## Data Layer (read this before writing any task)

Traced directly from `src/worker/repositories/content.js`'s `getProfileContent`/`replaceProfileContent` — do not assume field names without checking this file first, since the Zod schema in `src/lib/schemas/singletons.ts` (`profileSchema`) uses different field names (`longBio`) than what's actually read/written here and in `profile.ts`/`profile.astro` (`careerObjectives`) and appears to be unused for this content type.

**Correction from an earlier draft of this spec:** the CCNA/Google/OWASP "Certificates & Licenses" list is **not** backed by the D1 `certifications` table. That table only holds the 4 platform-training badges (Zapier/Make/n8n/HighLevel, seeded in `migrations/0005_seed_certifications.sql`) rendered by the separate `CertificationsGallery.jsx` gallery further down the page. The "Certificates & Licenses" list lives inside the same `profile_about` JSON blob as About/Education, as `certificatesAndLicenses: string[]` — plain pre-formatted strings like `"CCNA: Enterprise Networking, Security, and Automation - Cisco (June 2022)"`, with no structured `issuer` field. §5 below accounts for this.

| Content | D1 source | Repository functions | Static fallback | Admin UI |
|---|---|---|---|---|
| About (name/title/careerObjectives/shortBio/location/email/education/achievementsAndResponsibilities/certificatesAndLicenses) | `site_settings` row keyed `profile_about` (JSON blob) | `getSiteSetting`/`setSiteSetting` | `src/data/about.js` | `src/components/admin/ContentManager.jsx` |
| Experience | `experiences` table | `listExperiences`/`replaceExperiences` | `src/data/experiences.js` | `ContentManager.jsx` |
| Platform certification badges (Zapier/Make/n8n/HighLevel gallery — unrelated to §5's "Certificates & Licenses" list, not touched by this spec) | `certifications` table (`id, name, issuer, issued_date, credential_url, badge_image_url, sort_order, status`) | `listCertifications` (from `certifications.js`) | none (D1-only, seeded via migration) | `ContentManager.jsx` |
| Tools & Platforms marquee | **None** — confirmed dead/unused D1 path exists (`tools` table, `listTools`/`replaceTools`, wired to `profileContent.tools`) but the marquee reads `src/data/tools.js` directly, never `profileContent.tools`. Explicitly staying this way (see Non-Goals). | — | `src/data/tools.js` | none (developer-edited) |
| Portfolio projects | `projects` table (via `loadProjects()`, `src/lib/content/projects.ts`) | project repository functions + `scripts/cms/seed/project-seed.sql` | `src/data/projectRecords.js` | Admin's bespoke Projects editor |

**Rule for every content task below: update the D1-facing side (migration/seed data or a direct repository write) AND the matching static fallback file in the same task, so the admin CMS, a fresh D1 seed, and the JS-disabled/no-DB fallback path all agree.** Read `src/worker/repositories/content.js` and the relevant static fallback file yourself before writing changes — this table is a map, not a substitute for reading the actual current row shapes.

## Component Designs

### 1. Hero + About restructure (sidebar identity + document flow)

Replaces `PersonalInfoCard.jsx` + the "Career Objectives"/"Short Bio" card pair + the Education/Achievements/Certificates card row with one cohesive layout: a sticky-on-desktop identity sidebar (photo, name, title, availability pill, location, email, LinkedIn) beside a single continuous document flow (About → Technical breadth is *not* shown here, see §5 — → Education → Certifications), separated by a hairline border instead of each being its own shadowed box. On mobile, the sidebar stacks above the document flow (no sticky behavior below the `lg` breakpoint, consistent with how the rest of the site collapses to single-column).

**Content change — About:** merge `careerObjectives` + `shortBio` into one field (`about`, replacing both), reworded from the resume's Professional Summary:

> "AI Automation Architect and full-stack developer specializing in n8n workflow architecture, AI agents, and REST API integrations. I build end-to-end systems that validate data, apply business rules, connect third-party platforms, and route high-value cases for human review — with a full-stack foundation in React, Java, Spring Boot, and SQL."

**Content change — hero title:** flip from "Software Engineer & AI Automation Architect" to **"AI Automation Architect & Software Engineer"**, matching the resume's own header order (`AI Automation Architect | Software Engineer`).

**Data layer:** `profile_about`'s JSON shape drops `careerObjectives`/`shortBio` in favor of a single `about` string. This is a breaking shape change for that one JSON blob — the admin `ContentManager.jsx` form for this section needs its two textareas collapsed into one, and any code reading `aboutData.careerObjectives`/`aboutData.shortBio` (grep both terms across `src/` — known so far: `profile.astro`, `profile.ts`, `ContentManager.jsx`, `about.js`) needs updating together, in the same task, so nothing reads a field that no longer exists.

### 2. Experience — add missing roles, fix the badge

**Content change:** add three `experiences` rows from the resume (exact text, condensed to fit the existing bullet-list card format already in place):

1. **Full-Stack Developer** — Accenture, Cebu City, Philippines — June 2025 – June 2026. Bullets: developed/maintained full-stack apps (React, Java, Spring Boot, REST APIs, SQL); integrated databases, auth, third-party services into enterprise applications; designed/debugged API endpoints and service integrations; participated in code reviews, root-cause analysis, performance optimization, technical documentation.
2. **Process Engineer I** — ONSEMI, Lapu-Lapu City, Cebu — September 2024 – June 2025. Bullets: process analysis, root-cause investigation, corrective-action planning, production-data evaluation; built data-cleaning workflows and Power BI dashboards for loss analysis; developed the Plating Loss Monitoring dashboard.
3. **Manufacturing Engineer I** — ONSEMI, Lapu-Lapu City, Cebu — January 2024 – July 2024. Bullets: designed/implemented internal web apps for manufacturing execution and operational visibility; developed the Maintenance Online Logbook; developed the Fire Extinguisher Online Inspection System (QR-code access); supported system deployment, structured data management, process improvement, documentation.

Sort order: reverse-chronological by start date (the existing timeline's `index * 90` stagger-delay logic and the `experiences.length`-driven layout already generalize to more than one entry — verify this at implementation time rather than assuming, per the earlier redesign's own final-review findings about this exact file).

**Bug fix — date badge:** the badge (e.g. "September 2024 – Present") currently wraps and visually collides with the connecting dot/line at some widths. Fix the badge's sizing/line-height/`min-width` so any realistic date-range string (including the new, shorter "June 2025 – June 2026" and "September 2024 – June 2025" ranges) never touches the line or dot at any breakpoint the site supports (verify at the same breakpoints Playwright's three projects use: DPR 1/2/3, plus mobile width). Do not change the left-rail/dot/card structure itself — only the badge's box model.

### 3. Systems & Workflows — real expand/collapse

Replace the dead `+N additional workflow pattern(s)` / `+N additional characteristic(s)` text with an actual toggle: clicking it reveals the remaining items in place (appended to the visible list, not a modal/navigation), and a "Show less" control appears to collapse back to the truncated view. Two independent toggles (one per list) since Workflow Patterns and System Characteristics are shown/hidden independently today. No new data needed — this is a `SystemsPanel.jsx`-only change (local component state, no prop changes, no D1 involvement).

### 4. Portfolio — de-glassmorphize

`PortfolioGallery.jsx`/`PortfolioCard.jsx`: remove the `bg-slate-950/20` wrapper background and the `applyCenterFocus` opacity/blur falloff on off-center slides entirely — every visible slide gets identical, flat styling. Restyle `PortfolioCard.jsx` to match the certification cards' light surface (white/near-white background, existing card border-radius/shadow convention used elsewhere on the page, dark text) instead of the current dark/white-text glassmorphic treatment. The carousel *behavior* (autoplay, pause-on-hover, manual arrows, the windowed-image-loading fix from the last round, category tabs) is unchanged — this is styling only.

**Decision on the center-emphasis effect:** `applyCenterFocus` currently drives three things per slide — `opacity`, `filter: blur(...)`, and the `--center-scale` CSS variable. Drop `opacity` and `filter` entirely (these are exactly the "island" effect being removed). Keep `--center-scale`, but narrow its range from the current `1 - normalized * 0.1` (max 10% shrink) to a subtler `1 - normalized * 0.04` (max 4% shrink) — enough that the centered card reads as focused without any card looking visually broken or "wrong" the way a heavily blurred/faded flat-styled card would. This keeps a functioning, non-jarring focus cue while eliminating the blur/fade/dark-wrapper combination that caused the "disconnected block" complaint.

**Content change:** enrich the "Automated Lead Qualification" project's description (matches the resume's "Automated Real Estate Lead Qualification and Outbound Calling System") using the resume's detail: a three-workflow closed-loop system (lead intake → outbound AI calling → inbound caller matching → transcript processing → qualification → record updates → human acquisitions handoff), scheduled intake with normalization/deduplication/dispatch tracking, inbound lookup that normalizes phone numbers and matches callers to lead records, and API response validation/error handling/failure routing/human-review paths. Keep it to roughly the same length as the current description (2-3 sentences) — this is a quality upgrade, not an essay. Update both the D1 `projects` row (or seed data) and `src/data/projectRecords.js`.

### 5. Certifications — issuer logos; Technical Skills — removed, folded into the marquee

**Certifications:** `certificatesAndLicenses` is currently `string[]` — pre-formatted strings like `"CCNA: Enterprise Networking, Security, and Automation - Cisco (June 2022)"` with no structured issuer field. Restructure it to `Array<{ name: string, issuer: string | null, date: string | null }>` (a real shape change to this field inside the `profile_about` JSON blob — update the same four places as the About merge: `about.js`, `profile.ts`'s interface, `ContentManager.jsx`'s admin form, and `profile.astro`'s render call, plus the D1 row's JSON content). Parse each current string into its parts; where the issuer is unambiguous from the text, set it explicitly:

- "CCNA: Enterprise Networking, Security, and Automation - Cisco (June 2022)" → name "CCNA: Enterprise Networking, Security, and Automation", issuer "Cisco", date "June 2022"
- "Google Technical Support Fundamentals (February 2023)" → issuer "Google", date "February 2023"
- "OWASP Top 10: Securing Web Applications (2025)" → issuer "OWASP", date "2025"
- The remaining entries ("Introduction to Cybersecurity Tools & Cyber Attacks", "Using Google Forms to Analyze User Research Data", the two CCSP 2019 entries) have no unambiguous issuer in the current text — set `issuer: null` for these rather than guessing; do not invent an issuer that isn't already implied by the existing string.

Render a small issuer logo next to each entry that has a non-null issuer, resolved via a lookup map to vendored `simple-icons` SVGs (same sourcing mechanism as the Tools & Platforms marquee — reuse `scripts/copy-tool-logos.mjs`'s pattern rather than inventing a second one; `google.svg` is already vendored from the marquee work and can be reused as-is). Confirmed available: Cisco (`#1BA0D7`), Google (`#4285F4`), OWASP (`#000000`). Entries with `issuer: null` render with no logo (just the text), or a generic Lucide icon (e.g. `BadgeCheck`) if a placeholder is preferred for visual consistency — same graceful-degradation pattern used elsewhere on this page.

**Technical Skills:** do not add a skills-tag list to the About/document flow (redundant with the marquee). Instead, expand `src/data/tools.js` with resume tools not currently shown, using the same vendoring pipeline as the original marquee build:

| Tool | Logo source | Note |
|---|---|---|
| Claude (Anthropic) | `simple-icons` slug `claude`, `#D97757` | distinct from OpenAI, resume lists both |
| Postman | `simple-icons` slug `postman`, `#FF6C37` | |
| Spring Boot | `simple-icons` slug `springboot`, `#6DB33F` | |
| Next.js | `simple-icons` slug `nextdotjs`, `#000000` | |
| TypeScript | `simple-icons` slug `typescript`, `#3178C6` | |
| JavaScript | `simple-icons` slug `javascript`, `#F7DF1E` | |
| Git | `simple-icons` slug `git`, `#F03C2E` | distinct from GitHub, already shown |
| Vercel | `simple-icons` slug `vercel`, `#000000` | |
| PHP | `simple-icons` slug `php`, `#777BB4` | |
| Java | `simple-icons` slug `openjdk`, `#000000` | **not** Java's actual coffee-cup mark — closest available substitute, confirmed with the user |
| Retell AI | no logo available | generic icon (e.g. `Phone` or `Mic`), same treatment as the existing "API Integrations" entry |
| Twilio | no logo available | generic icon (e.g. `MessageSquare`) |
| SQL / Databases | no specific brand named in the resume | generic icon (e.g. `Database`) |

The existing D1 `skills` content type (`profileContent.skills.technical`/`.personal`, backed by `listSkills`/`replaceSkills`) is unrelated to this and stays as-is — it's already unrendered on the public page (confirmed: no "Technical Skills" section exists in the current live page), and this spec does not change that.

## Non-Goals

- **No color/theme overhaul.** Light background, purple/teal brand accents stay exactly as they are. The reference site (brittanychiang.com) informed *structural* principles (hierarchy, flatness, less redundant boxing) — not a dark-theme rebuild.
- **No new Portfolio project.** The resume's "Memory Preview" (AI memory-governance) project is not added as a new portfolio entry — explicitly declined.
- **No reviving the dead D1 `tools`/`listTools` path.** The marquee stays static/code-edited, per explicit decision — do not wire `ToolsMarquee` to `profileContent.tools`.
- **No `profileSchema` (`src/lib/schemas/singletons.ts`) changes.** That schema appears unused by this content type's actual read/write path; do not "fix" it to match unless investigation during implementation finds it's live somewhere this spec didn't uncover — if so, stop and flag it rather than silently changing schema used elsewhere.
- **No permanent new automated test suite requirement** beyond what the previous round already established as this project's convention (throwaway/manual Playwright verification per task, per `docs/superpowers/plans/2026-08-06-profile-page-redesign.md`'s precedent) — carry that same convention forward.

## Testing

Same conventions as the 2026-08-06 redesign: `npm run typecheck && npm run build` after every task; `npm run build && npm run preview` for visual/interaction verification; throwaway Playwright specs (deleted after passing) for anything needing real browser confirmation (the expand/collapse toggle, the badge not overlapping at multiple viewport widths, the flat carousel styling, issuer logos rendering). Re-run `tests/e2e/image-weight.spec.js` unmodified after the Portfolio/marquee changes — removing the blur/opacity CSS doesn't change *which* images load, but confirm the budget still holds since it was tuned precisely against the current carousel's windowed-loading behavior.

If a task changes `profile_about`'s JSON shape (the About merge, the `certificatesAndLicenses` restructure) or adds `experiences` rows, verify against a real local D1 instance (`npx wrangler d1 migrations apply devlab-studios-cms --local` first if needed) via `npm run preview`, not just the static fallback — the two paths can silently diverge if only one is tested.
