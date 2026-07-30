> ## ⚠️ 2026-07-30 Status Update
> Original audit below is from **March 10, 2026**, written against an assumed
> GitHub Pages/Cloudflare Pages static deployment. A **2026-07-30 Status**
> line has been added under each finding to reflect what's true against the
> current Cloudflare Worker + D1 + R2 codebase. This is a relocation +
> annotation pass, not a new security scan — see
> [SECURITY_DOCUMENTATION_INDEX.md](./SECURITY_DOCUMENTATION_INDEX.md) for the
> summary table.

---

# Security Audit Report: Tech VA Portfolio
**Date:** March 10, 2026  
**Scope:** Full codebase security review for production readiness  
**Status:** ⚠️ **CRITICAL ISSUES FOUND** - Requires immediate action before deploying

---

## Executive Summary

Your Tech VA Portfolio website has a **solid security foundation** with proper error handling, environment variable management, and code structure. However, **critical security vulnerabilities** have been identified that **must** be resolved before going live to prevent unauthorized access to third-party service credentials.

### Overall Risk Level: 🔴 **HIGH** (1 Critical, 2 Major, 5 Minor)

---

## 🔴 CRITICAL FINDINGS

### 1. **Exposed API Credentials in `.env.example`**
**Severity:** 🔴 CRITICAL  
**Location:** `.env.example`  
**Issue:** 
The `.env.example` file contains **contact endpoint credentials/config values** that should never be real in source control:
```
VITE_ZOHO_WEBHOOK_URL=https://real-zoho-endpoint
VITE_ZOHO_PAYLOAD_FORMAT=json
```

This is a **critical security vulnerability** because:
- `.env.example` is **typically committed to version control** and visible to everyone
- Anyone with access to the repo can abuse the endpoint to:
  - Submit spam payloads to your Zoho workflow/forms destination
  - Consume workflow quotas and operation limits
  - Trigger noisy or malicious entries in downstream systems

**Impact:** Unauthorized form submission, workflow abuse, endpoint compromise  
**Fix Priority:** ⚠️ **IMMEDIATE** (before any deployment)

> **2026-07-30 Status: ✅ Resolved.** Current `.env.example` contains only
> placeholder values (`ZOHO_WEBHOOK_URL=https://your-zoho-endpoint-here`), and
> the real webhook URL is no longer a `VITE_`-prefixed client variable at all
> — it's `ZOHO_WEBHOOK_URL`, read server-side only by `src/worker.js`, never
> shipped to the browser.

---

### 2. **Exposed API Credentials in `.env.local` (Local Machine)**
**Severity:** 🔴 CRITICAL  
**Location:** `.env.local`  
**Issue:**
The `.env.local` file can still expose active Zoho endpoint values if a machine or backup is compromised.

**Impact:** Local credential exposure, potential repository compromise  
**Fix Priority:** ⚠️ **IMMEDIATE**

> **2026-07-30 Status: ⚠️ Not independently verifiable.** `.env.local` is a
> gitignored, machine-local file and was not opened as part of this
> non-security-focused housekeeping pass. Confirm manually that any
> previously-exposed Zoho endpoint has been rotated.

---

## 🟠 MAJOR FINDINGS

### 3. **Missing Content Security Policy (CSP) Headers**
**Severity:** 🟠 MAJOR  
**Issue:**
Your site hosted on GitHub Pages loads external resources without Content Security Policy protection:
- Google Analytics (gtag.js)
- Google Fonts
- External CDNs (if any added in future)

No CSP headers are configured to restrict what scripts can execute or what resources can load.

**Current State:** ❌ Not configured

> **2026-07-30 Status: ✅ Resolved.** `public/_headers` now sets a full CSP
> (`default-src 'self'; script-src ... ; connect-src ...`) plus
> `X-Frame-Options: DENY`, applied as real HTTP headers by the Cloudflare
> Worker's asset serving — not a meta-tag workaround.

---

### 4. **Missing Sub-Resource Integrity (SRI) for External Resources**
**Severity:** 🟠 MAJOR  
**Issue:**
External scripts loaded in `index.html` don't have SRI hashes:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-MD3PL91M9G"></script>
```

If Google's CDN is compromised, malicious code could be injected.

> **2026-07-30 Status: ❌ Still open.** `index.html` still loads `gtag.js`
> without an `integrity` attribute. Note for whoever picks this up: Google's
> `gtag.js` is served dynamically and its content can change without notice,
> which makes a static SRI hash practically unmaintainable for that specific
> script — SRI is more realistic for the Google Fonts CSS link. Low priority
> given the CSP already restricts script origins to a small allowlist.

---

## 🟡 MINOR FINDINGS

### 5. **Google Analytics Tracking ID Exposed in HTML**
**Severity:** 🟡 MINOR  
**Issue:**
Your GA4 Measurement ID is visible in the public HTML.

**Recommendation:** 
✅ This is expected for Google Analytics and generally acceptable. No action needed.

> **2026-07-30 Status: N/A.** Unchanged, no action needed (same as original assessment).

---

### 6. **Email Validation Could Be More Robust**
**Severity:** 🟡 MINOR  
**Location:** `src/pages/Contact.jsx`  
**Issue:**
Email regex validation:
```javascript
!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
```

This regex is basic and allows some invalid emails like `a@b.c` (single-character local part).

> **2026-07-30 Status: ❌ Still open (low priority).** The identical regex is
> now also used server-side in `validateContactPayload()`
> (`src/worker.js`), so validation is at least enforced on both client and
> server, but the pattern itself is unchanged.

---

### 7. **No Rate Limiting on Contact Form**
**Severity:** 🟡 MINOR  
**Location:** `src/pages/Contact.jsx`  
**Issue:**
Users can submit the contact form unlimited times, potentially flooding your inbox with spam or abusing Zoho workflow/form quotas.

> **2026-07-30 Status: ✅ Resolved — and via the recommended "better
> solution".** `src/worker.js` now implements server-side rate limiting
> (`isContactRateLimited`: 5 attempts per 10-minute window per client IP),
> which the original report explicitly called out as the stronger fix over a
> client-side cooldown.

---

### 8. **GitHub Actions Workflow Could Have Better Security**
**Severity:** 🟡 MINOR  
**Location:** `.github/workflows/deploy.yml`  
**Current State:** ✅ Generally good, but could be improved.

> **2026-07-30 Status: ✅ Resolved.** The workflow (now `.github/workflows/ci.yml`
> after this housekeeping pass) already restricts triggers to `main`, uses
> `actions/checkout@v4` and `actions/setup-node@v4` with npm caching, and
> includes an `npm audit --omit=dev --audit-level=high` step.

---

### 9. **No HTTPS Enforcement Headers**
**Severity:** 🟡 MINOR  
**Issue:**
Missing HTTP security headers that browsers should enforce (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).

**Current State (original):**
- ✅ HTTPS is enforced by GitHub Pages
- ❌ Headers not explicitly set

> **2026-07-30 Status: ✅ Resolved.** `public/_headers` now explicitly sets
> `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
> `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
> and `Permissions-Policy`. `src/worker.js` also has a middleware forcing
> `www.devlabstudios.com` + HTTPS via 301 redirect.

---

### 10. **No Dependency Vulnerability Scanning**
**Severity:** 🟡 MINOR  
**Issue:**
The GitHub Actions workflow doesn't check dependencies for known vulnerabilities.

> **2026-07-30 Status: ✅ Resolved.** `npm audit --omit=dev --audit-level=high`
> runs on every PR/push to `main` in `.github/workflows/ci.yml`.

---

## ✅ SECURITY STRENGTHS

Your application has these positive security practices:

| Aspect | Status | Details |
|--------|--------|---------|
| **Error Handling** | ✅ Excellent | Errors sanitized, dev details only in DEV mode |
| **XSS Protection** | ✅ Strong | No `dangerouslySetInnerHTML`, proper React escaping |
| **Environment Variables** | ✅ Good | Correct VITE_ prefix, proper .env structure |
| **.gitignore** | ✅ Proper | .env files excluded from version control |
| **Dependency Versions** | ✅ Current | React 19, modern tooling (Vite, Tailwind) |
| **Error Boundaries** | ✅ Implemented | Graceful error handling with user-friendly messages |
| **SEO Security** | ✅ Good | robots.txt and sitemap.xml properly configured |
| **Code Structure** | ✅ Clean | Well-organized, easy to audit |
| **Maintenance Mode** | ✅ Smart | Allows graceful degradation |

---

## 📊 Security Headers Comparison

| Header | Original (Mar 2026) | Current (Jul 2026) |
|--------|---------|--------|
| **Content-Security-Policy** | ❌ No | ✅ Yes (`public/_headers`) |
| **X-Content-Type-Options** | ❌ No | ✅ Yes |
| **X-Frame-Options** | ❌ No | ✅ Yes |
| **Strict-Transport-Security** | ✅ Yes (platform-level) | ✅ Yes (explicit) |
| **Referrer-Policy** | ❌ No | ✅ Yes |
| **Permissions-Policy** | ❌ No | ✅ Yes |

---

## 🔍 Testing & Validation

### Security Testing Tools

1. **Check headers:**
   ```bash
   curl -I https://www.devlabstudios.com/
   ```

2. **OWASP Top 10 validator:**
   - Use online tools like [OWASP ZAP](https://www.zaproxy.org/)
   - Or Mozilla's [Observatory](https://observatory.mozilla.org/)

3. **Dependency audit:**
   ```bash
   npm audit
   npm outdated
   ```

---

## 📚 References & Further Reading

- [OWASP Top 10 Web Application Security Risks](https://owasp.org/www-project-top-ten/)
- [Content Security Policy (CSP) Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Sub-Resource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- [React Security Best Practices](https://react.dev/reference/react-dom/createRoot#avoiding-security-pitfalls)

---

## 🎯 Summary (original, March 2026)

**Overall Assessment:** Your portfolio has a **solid foundation** with good error handling and code practices. However, **critical security vulnerabilities** with exposed API credentials must be resolved immediately before deployment to production.

**2026-07-30 update:** 7 of 10 findings resolved, 1 unverifiable (local
gitignored file), 2 remain open at low priority (SRI on `gtag.js`, email
regex strictness). See
[SECURITY_DOCUMENTATION_INDEX.md](./SECURITY_DOCUMENTATION_INDEX.md) for the
full table.

---

*Original report generated by GitHub Copilot Security Audit, March 10, 2026.*
