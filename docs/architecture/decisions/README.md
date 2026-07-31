# Architecture Decision Records

Lightweight ADRs for the non-obvious calls made during the Astro/CMS
rebuild program — written in Phase 6, capturing decisions made from
Phase 1 onward while the reasoning was still fresh. Format: Context /
Decision / Consequences. Not every decision in the rebuild gets one, only
the ones a future reader (including a future session) would otherwise
have to re-derive from git archaeology.

1. [Rewrite rendering with Astro + @astrojs/cloudflare](./0001-astro-cloudflare-rendering.md)
2. [Schema-driven CMS with Zod, versioning, and an audit log](./0002-schema-driven-cms.md)
3. [Leads delivery: waitUntil + manual retry, not a Cloudflare Queue](./0003-leads-delivery-waituntil.md)
4. [Enforce security headers in middleware, not \_headers](./0004-security-headers-in-middleware.md)
5. [Preview environment via CLOUDFLARE_ENV at build time, not wrangler --env](./0005-preview-environment-build-time-env.md)
