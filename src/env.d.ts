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
  SESSION_COORDINATOR: DurableObjectNamespace
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
