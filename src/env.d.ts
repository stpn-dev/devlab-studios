/// <reference types="astro/client" />

interface Env {
  DB: D1Database
  MEDIA_BUCKET: R2Bucket
  SESSION: KVNamespace
  ADMIN_AUTH_MODE?: string
  R2_PUBLIC_BASE_URL?: string
  ZOHO_WEBHOOK_URL?: string
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD_HASH?: string
  ADMIN_SESSION_SECRET?: string
  ADMIN_USERS?: string
  TURNSTILE_SECRET_KEY?: string
}

declare namespace App {
  interface Locals {
    adminEmail?: string
    adminRole?: string
    adminAuthMode?: string
    cfContext?: { waitUntil(promise: Promise<unknown>): void }
  }
}
