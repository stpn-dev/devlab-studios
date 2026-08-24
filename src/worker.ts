// Custom Worker entrypoint for the whole site.
//
// @astrojs/cloudflare normally generates this entrypoint itself
// (`main: "@astrojs/cloudflare/entrypoints/server"`), but that generated
// entrypoint cannot export additional classes — and a Durable Object has to be
// exported from the Worker's entrypoint module to be bound. So this file takes
// over as `main` and does exactly two things:
//
//   1. Delegates *every* request to Astro's own `handle()`, unchanged. No
//      routing, no interception, no short-circuits — the public site, the
//      Admin CMS, and every API route behave exactly as they did before.
//   2. Additionally exports the Durable Object class alongside it.
//
// See docs/architecture/decisions/0006-pickleball-durable-objects.md.
import { handle } from '@astrojs/cloudflare/handler'
import { SessionCoordinatorDO } from './worker/pickleball/SessionCoordinatorDO'

export { SessionCoordinatorDO }

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
