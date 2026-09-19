/// <reference types="astro/client" />

interface Env {
  DB: D1Database
  MEDIA_BUCKET: R2Bucket
  SESSION: KVNamespace
  ADMIN_AUTH_MODE?: string
  R2_PUBLIC_BASE_URL?: string
  RESEND_API_KEY?: string
  RESEND_FROM_EMAIL?: string
  LEAD_NOTIFICATION_EMAIL?: string
  /**
   * Optional outbound destination for inquiries (CRM, sheet, n8n/Make, task
   * system). Entirely inert unless set — see src/worker/delivery/providers.js.
   */
  LEAD_WEBHOOK_URL?: string
  /** Optional shared secret sent as `X-DevLab-Signature` with each webhook post. */
  LEAD_WEBHOOK_SECRET?: string
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD_HASH?: string
  ADMIN_SESSION_SECRET?: string
  ADMIN_USERS?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  PICKLEBALL_DB: D1Database
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  PICKLEBALL_SESSION_SECRET?: string
  PICKLEBALL_OAUTH_REDIRECT_BASE_URL?: string
  PICKLEBALL_TEST_AUTH_ENABLED?: string
  SESSION_COORDINATOR: DurableObjectNamespace<import('./worker/pickleball/SessionCoordinatorDO').SessionCoordinatorDO>
  RATE_LIMITER: DurableObjectNamespace<import('./worker/RateLimiterDO').RateLimiterDO>

  // ---------------------------------------------------------------------
  // Lead Intelligence Engine
  //
  // Every flag is optional and defaults to OFF. A deploy that sets none of
  // them changes nothing observable: no discovery, no crawling, no Workers AI
  // spend, no mailbox polling. See src/lead-engine/config/flags.js.
  //
  // There is deliberately no LEAD_AUTO_SEND flag, because automated prospect
  // email sending does not exist in this system.
  // ---------------------------------------------------------------------
  /** Master switch. Every other lead flag is ANDed with this one. */
  LEAD_ENGINE_ENABLED?: string
  LEAD_DISCOVERY_ENABLED?: string
  LEAD_CRAWLER_ENABLED?: string
  LEAD_BROWSER_RUN_ENABLED?: string
  LEAD_AI_ENABLED?: string
  LEAD_TRACKING_ENABLED?: string
  LEAD_CAMPAIGN_SCHEDULES_ENABLED?: string

  /** Optional discovery source. The engine works without it. */
  BRAVE_SEARCH_API_KEY?: string

  /** Optional Browser Rendering fallback for client-rendered sites. */
  CLOUDFLARE_ACCOUNT_ID?: string
  BROWSER_RENDERING_API_TOKEN?: string


  // Optional Queue bindings. Absent by default — the D1 job ledger drains the
  // same work on the cron tick when they are not configured.
  LEAD_RESEARCH_QUEUE?: Queue
  LEAD_AI_REVIEW_QUEUE?: Queue
  LEAD_MAILBOX_QUEUE?: Queue

  // Optional Workflow bindings, likewise absent by default.
  LEAD_CAMPAIGN_DISCOVERY_WORKFLOW?: Workflow
  LEAD_RESEARCH_WORKFLOW?: Workflow
  LEAD_MAILBOX_SYNC_WORKFLOW?: Workflow
  LEAD_REPLY_ANALYSIS_WORKFLOW?: Workflow
  LEAD_MAINTENANCE_WORKFLOW?: Workflow
}

declare namespace App {
  interface Locals {
    adminEmail?: string
    adminRole?: string
    adminAuthMode?: string
    cfContext?: { waitUntil(promise: Promise<unknown>): void }
    pickleballSession?: { userId: string; googleSub: string; activeOrgId: string | null; exp: number }
  }
}
