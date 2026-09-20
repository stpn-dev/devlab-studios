# Lead Intelligence Engine

Operational documentation for the DevLab Lead Intelligence Engine.

## What this system is

It finds small businesses that might benefit from custom software, researches
their public websites, scores them deterministically, asks Workers AI whether
the observed facts add up to a real opportunity, finds a publicly published
business contact address, and writes a suggested first email.

Then it stops. It saves that email into the operator's Zoho Drafts folder and a
human opens Zoho and sends it by hand. **There is no send capability anywhere in
this codebase** — not disabled, not flagged off, absent. The engine watches the
Zoho Sent folder to learn what was actually sent, imports replies, and suggests
responses to them. Everything it runs on is Cloudflare: one Worker, D1 as the
system of record, Workers AI, the existing cron trigger.

It ships **fully switched off**. Every feature flag defaults to `false` in
`wrangler.jsonc`, the seeded discovery sources are registered but disabled and
policy-unreviewed, and the seeded campaign is a draft with its schedule
disarmed.

## The documents

| Document | What it covers |
|---|---|
| [architecture.md](architecture.md) | The whole shape: one Worker, D1 as system of record, why `lead_*` lives in the CMS database, and why there is no send capability |
| [data-model.md](data-model.md) | All 22 `lead_*` tables, their purpose, constraints and idempotency guarantees |
| [pipeline.md](pipeline.md) | The 24 stages, how transitions work, the compliance-terminal one-way door, and the activity vocabulary |
| [discovery.md](discovery.md) | The source registry gate, Overpass, optional Brave, manual CSV/domain import, and deduplication |
| [crawler.md](crawler.md) | robots.txt handling, the four-page budget, SSRF guards, redirect validation, the transparent user agent, and Browser Run |
| [scoring.md](scoring.md) | The four categories, the weights, the routing bands, explainability, and a worked example |
| [workers-ai.md](workers-ai.md) | Gating, payload minimization, the four versioned prompts, output validation, the invention guard, and the audit ledger |
| [contacts.md](contacts.md) | Provenance as an admission requirement, no guessed addresses, and why MX presence is not mailbox verification |
| [compliance.md](compliance.md) | Operational safeguards (not legal advice), the US and PH profiles, the human-review fallback, suppression, and opt-out detection |
| [outreach-handoff.md](outreach-handoff.md) | How an approved draft reaches a recipient: exported as a file you send yourself, why the mailbox integration was removed, and what the legacy schema names mean |
| [outbound-mail-infrastructure.md](outbound-mail-infrastructure.md) | The automated sending path: why no ESP will permit this workload, the own-MTA architecture, what is verified, the legal position, and what still blocks a first send |
| [conversations.md](conversations.md) | Thread matching order, why subject never decides alone, message immutability, and the reply copilot |
| [cloudflare-workflows.md](cloudflare-workflows.md) | The five Workflow classes, why they are thin, why they are not bound, and what activation actually requires |
| [queues.md](queues.md) | The four queues, consumer settings, why they are not bound, and the D1 job ledger that makes them optional |
| [operations.md](operations.md) | The daily working loop, reading the dashboard, usage guardrails, dead-lettered jobs, failed syncs, exhausted AI budget |
| [environment.md](environment.md) | Every variable and secret, which is which, defaults, and what is optional |
| [testing.md](testing.md) | The 497 unit tests, how to run them, and what is deliberately not covered |
| [deployment.md](deployment.md) | How this ships inside the existing deploy process, the migration, and the ordered enable sequence |
| [dry-run.md](dry-run.md) | The exact procedure for Discovery Campaign 001, and what to inspect before anyone is contacted |
| [disaster-recovery.md](disaster-recovery.md) | What is in Git, what is only operational data, D1 backup/restore, and reconstruction |

## Where the code lives

| Path | Contents |
|---|---|
| `migrations/0012_lead_intelligence_engine.sql` | The whole schema, heavily commented |
| `src/lead-engine/` | The engine: config, domain, crawler, signals, scoring, ai, contacts, compliance, discovery, mail, services, jobs, repositories |
| `src/lead-engine/workflows/index.ts` | Cloudflare Workflow classes (exported, not bound) |
| `src/lead-engine/queues/consumer.js` | Cloudflare Queues consumer (declared, not bound) |
| `src/pages/api/admin/lead-crm/` | Admin API routes |
| `src/admin-app/pages/lead-crm/` | Admin CRM screens, mounted at `/admin/lead-crm` |
| `src/pages/r/[token].ts` | The public tracked-redirect endpoint |
| `src/pages/crawler.astro` | The public crawler disclosure page |
| `scripts/lead-engine/seed.mjs` | Source registry + Campaign 001 seed generator |

## Related repository documentation

- [`../architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) — the site as a whole
- [`../deployment.md`](../deployment.md) — how a build reaches Cloudflare
- [`../operations.md`](../operations.md) — site-wide environment and bindings
- [`../security.md`](../security.md) — headers, auth, Turnstile
