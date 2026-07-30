# 📚 Security Documentation Index

> ## ⚠️ 2026-07-30 Status Update
> This entire document suite was written **March 10, 2026** against an
> assumed **GitHub Pages / Cloudflare Pages, static-only** deployment. The
> project has since moved to a single **Cloudflare Worker** deployment
> (`wrangler.jsonc`, `src/worker.js`) with a real backend (D1 + R2 + Hono).
> Most CRITICAL/MAJOR findings below are now **resolved** — see the status
> annotations added to each document, and
> [../CURRENT_STATE.md](../CURRENT_STATE.md) for the current picture. This is
> a **relocation + annotation pass only** — it is not a fresh security audit.
> A new audit against the current Worker/D1/R2 codebase is recommended before
> relying on this suite for anything beyond history.

## Overview

This directory contains the original (March 2026) security audit
documentation and remediation guides for the project. Kept for historical
reference and to track which findings have since been addressed.

---

## 📄 Core Documents

### 1. 🔴 [SECURITY_QUICK_REFERENCE.md](./SECURITY_QUICK_REFERENCE.md)
One-page executive summary of the original audit, with a 2026-07-30 status
banner.

### 2. 📋 [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)
The original 10-finding detailed analysis, with a per-finding status
annotation added.

### 3. ✅ [SECURITY_REMEDIATION_CHECKLIST.md](./SECURITY_REMEDIATION_CHECKLIST.md)
The original step-by-step fix guide, with each item's status updated to
reflect what's actually been resolved in code since.

### 4. 🚀 [Production Deployment Guide](../guides/PRODUCTION_DEPLOYMENT_GUIDE.md)
Moved to `docs/guides/` and corrected to describe the current Cloudflare
Worker deployment model (not GitHub Pages/Cloudflare Pages).

---

## 🎯 Resolved vs. Open (as of 2026-07-30)

| # | Finding | Original Severity | Current Status |
|---|---|---|---|
| 1 | Exposed credentials in `.env.example` | 🔴 Critical | ✅ Resolved |
| 2 | Exposed credentials in `.env.local` | 🔴 Critical | ⚠️ Not independently verifiable (local, gitignored file) |
| 3 | Missing CSP headers | 🟠 Major | ✅ Resolved (`public/_headers`) |
| 4 | Missing SRI on external scripts | 🟠 Major | ❌ Open (see annotation in audit report — largely infeasible for `gtag.js`) |
| 5 | GA tracking ID exposed | 🟡 Minor | N/A — expected/acceptable |
| 6 | Basic email regex | 🟡 Minor | ❌ Open (same regex still in use, low priority) |
| 7 | No contact form rate limiting | 🟡 Minor | ✅ Resolved (server-side, `src/worker.js`) |
| 8 | CI workflow security | 🟡 Minor | ✅ Resolved (`npm audit` in `ci.yml`) |
| 9 | No HTTPS enforcement headers | 🟡 Minor | ✅ Resolved (`public/_headers`) |
| 10 | No dependency vulnerability scanning | 🟡 Minor | ✅ Resolved (`npm audit` in `ci.yml`) |

**7 of 10 resolved**, 1 unverifiable (local file), 2 still open (SRI, email
regex — both low priority; see individual documents for detail).
