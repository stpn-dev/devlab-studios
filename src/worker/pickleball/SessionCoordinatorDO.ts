// TEMPORARY stub — replaced by Task 6's real implementation.
//
// This exists only so `src/worker.ts` (the site's custom Worker entrypoint)
// has a concrete class to re-export, which is what makes the
// `SESSION_COORDINATOR` Durable Object binding in wrangler.jsonc resolvable.
// It deliberately holds no coordination logic: court assignment lives in
// Task 6's implementation, and this file must be gone by the end of Phase 3.
import { DurableObject } from 'cloudflare:workers'

export class SessionCoordinatorDO extends DurableObject<Env> {}
