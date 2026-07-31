import { env } from 'cloudflare:workers'

export function getEnv(): Env {
  return env as unknown as Env
}
