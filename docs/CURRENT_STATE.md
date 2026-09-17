# Current State

Snapshot as of 2026-09-17, after the business-first rebuild.

## Product positioning

DevLab Studios is presented primarily as a **business**: a software and
automation studio that designs reliable business systems. The central
proposition is "DevLab Studios builds reliable software and automation systems
for businesses", and the public hierarchy — homepage, navigation, featured
proof, and every primary call to action — is business-focused.

Visitors are never asked to classify themselves. There is no audience-selection
screen, modal, or homepage section.

Stephen Rey Agustinez is presented on the **Founder Profile** as Founder,
Full-Stack Developer, and AI Automation Architect — a first-class supporting
page for employers, recruiters, contract work, and technical evaluation.
Employment messaging lives there, not in the business funnel.

## Public experience

- **Home** follows the business journey: outcome hero → operational problems →
  four solution categories → verified project proof → delivery approach →
  reliability principles → insight and lead magnet → founder credibility → FAQ
  → final inquiry CTA.
- **Solutions** (`/services` — route deliberately unchanged, label changed)
  presents four business categories: Lead Intake and Follow-up Systems,
  Workflow and AI Automation, Custom Software and Operations Systems, and the
  Workflow Systems Audit entry offer. The CMS service catalogue is mapped
  underneath rather than replaced; an unmapped service group still renders.
- **Work** frames each project as business proof — the problem, the system
  designed for it, and what it verifiably does in operation — and states its
  evidence standard openly rather than showing invented metrics.
- **Founder Profile** keeps and strengthens name, role, summary, capabilities,
  education, certifications, experience, tools, selected projects, résumé,
  GitHub, LinkedIn, and availability, with its own CTAs (View Selected Work /
  Download Résumé / Contact Stephen).
- **Contact** is a structured two-step inquiry flow with an inquiry-type
  selector; CTA context preselects the type via `?type=`. Employers reach a
  separate short employment form and never the business qualification
  questions.
- **Offers** (`/offers/[slug]`) are lead-magnet landing pages. The resource
  itself stays publicly readable in Insights — nothing is gated.
- Navigation is Home · Solutions · Work · Insights · About · Profile, with one
  header CTA ("Discuss Your System"). The Profile item is labelled Profile,
  never "Hire Me".
- The established dark-native visual system, tokens, components, and
  reduced-motion behavior are unchanged.

## Inquiry pipeline

`/api/inquiries` is the single public entry point; `/api/lead-magnet` and the
legacy `/api/contact` normalize into the same shape and run the same service.

An inquiry is persisted to D1 **before** any external delivery is attempted,
and the visitor's success response is decided by that write. Delivery runs
afterwards against every configured provider, and every attempt is recorded
with a failure category. Consent and attribution are stored alongside.
Qualification is deterministic and stores its reasons.

See [ADR 0007](architecture/decisions/0007-business-inquiry-pipeline.md).

## CMS and admin

- Page blocks gained `problemList` and `leadMagnet`; `cta` gained routing
  context (`inquiryType`, `formId`, `offerId`, `solutionId`).
- `/admin/leads` is now "Inquiries": filter by type, pipeline status,
  qualification, delivery state and free-text search; change status; assign an
  owner; add internal notes; view qualification reasons, attribution, consent,
  delivery attempts and activity; retry an eligible failed delivery; soft
  archive; export CSV.
- Admin labels follow `src/config/publicSurfaces.js`, so CMS labels cannot
  drift from the routes visitors see.

## SEO

- Business pages target business-system search intent; the Founder Profile
  targets Stephen's verified individual capabilities, so the two no longer
  compete for the same query.
- `sitemap.xml` is generated at request time and lists only canonical,
  indexable URLs. The stale static file (which listed `/resources/*` redirect
  sources) was removed.
- Structured data: Organization, WebSite, Service per solution, Person on the
  Profile, Article on insights, BreadcrumbList, and FAQPage only where the
  questions are actually rendered. No LocalBusiness — the studio is remote.

## Deployment and branches

- `development` deploys to the isolated `devlab-studios-preview` Worker with
  Preview D1, R2, and secrets.
- `main` deploys production through Cloudflare Workers Builds.

## Verification baseline (2026-09-17)

- `npm run typecheck` — 0 errors
- `npm run build` — passes
- `npm run test:unit` — 489 passing across 41 files
- `npx eslint .` — 0 errors (1 pre-existing warning in `WorkPageManager.jsx`)
- Playwright `static` — 94 passing, 1 skipped
- Playwright `worker` (`admin.spec.js`) — 35/35 serially
- Playwright `worker` (pickleball auth/crud/rate-limit/public-pages) — 60/60
- Migration validated against a real SQLite database: pre-existing lead and
  delivery-attempt rows survive `0009` untouched and backfill correctly

## Environment status

- **Pending operator action:** apply `migrations/0009_business_inquiry_platform.sql`
  and `scripts/cms/updates/2026-09-17-business-first-content.sql` to Preview,
  verify, then Production. See [operations.md](operations.md).
- `LEAD_WEBHOOK_URL` / `LEAD_WEBHOOK_SECRET` are optional and unset; the
  outbound webhook provider stays inert until they are configured.
- **Pending operator action:** `ADMIN_PASSWORD_HASH` held a retired
  single-round SHA-256 hash, which `verifyPassword` refuses (reported as a 503
  configuration error rather than a bad password). Re-generate with
  `npm run cms:hash-admin-password` and set it as a **Secret** on both Workers
  — it must never go into `wrangler.jsonc`, whose `vars` are plaintext and
  committed.
- `env.preview` now mirrors the top-level `RATE_LIMITER` Durable Object,
  `images` binding, and the two Resend vars. Nothing at the top level is
  inherited by an environment, and `checkRateLimit()` fails open when the
  binding is absent, so preview had been enforcing no rate limits at all.

## Known limitations and follow-ups

- The `site settings save round-trip` admin e2e test races with the versioning
  test under parallel workers — both write the same global `site_settings` row.
  Pre-existing; reproduced on the unmodified spec. Passes serially.
- Delivery retry is bounded per invocation plus manual admin retry; there is no
  scheduled retry worker (see ADR 0003 for why there is no Queue).
- Case studies and testimonials collections remain backward-compatible but
  unused; Work write-ups are the proof surface.
- Production D1 content must be inspected directly before assuming it matches
  seed files or Preview.
