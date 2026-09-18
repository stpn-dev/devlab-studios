import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestD1 } from '../../worker/repositories/testSupport/d1Sqlite.js'
import { resolveFlags } from './flags.js'
import {
  getOperationalFlagState,
  updateOperationalFlag,
  withOperationalFlags,
} from './operationalFlags.js'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(resolve(here, '../../../migrations/0012_lead_intelligence_engine.sql'), 'utf8')

const ALLOWED = {
  LEAD_ENGINE_ENABLED: 'true',
  LEAD_CRAWLER_ENABLED: 'true',
  LEAD_AI_ENABLED: 'true',
  ZOHO_MAIL_ENABLED: 'true',
  ZOHO_MAIL_SYNC_ENABLED: 'true',
}

let db

beforeEach(() => {
  db = createTestD1([migration])
})

describe('operational feature flags', () => {
  it('preserves deployed behavior until an administrator saves an override', async () => {
    const state = await getOperationalFlagState({ ...ALLOWED, DB: db })

    expect(state.persisted).toBe(false)
    expect(state.effective).toMatchObject({ engine: true, crawler: true, ai: true, zohoMail: true })
  })

  it('turns an allowed capability off and back on immediately', async () => {
    const env = { ...ALLOWED, DB: db }

    await updateOperationalFlag(env, 'ai', false, { actorEmail: 'admin@example.com' })
    expect(resolveFlags(await withOperationalFlags(env)).ai).toBe(false)

    await updateOperationalFlag(env, 'ai', true, { actorEmail: 'admin@example.com' })
    expect(resolveFlags(await withOperationalFlags(env)).ai).toBe(true)
  })

  it('cannot enable a capability forbidden by deployment configuration', async () => {
    await expect(
      updateOperationalFlag({ LEAD_ENGINE_ENABLED: 'true', LEAD_DISCOVERY_ENABLED: 'false', DB: db }, 'discovery', true),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('turning off Zoho Mail also turns off mailbox sync', async () => {
    const env = { ...ALLOWED, DB: db }
    await updateOperationalFlag(env, 'zohoMail', false)
    const state = await getOperationalFlagState(env)

    expect(state.requested.zohoMail).toBe(false)
    expect(state.requested.zohoMailSync).toBe(false)
    expect(state.effective.zohoMailSync).toBe(false)
  })

  it('fails closed when D1 cannot be read', async () => {
    const state = await getOperationalFlagState({
      ...ALLOWED,
      DB: { prepare: () => { throw new Error('D1 unavailable') } },
    })

    expect(state.available).toBe(false)
    expect(Object.values(state.effective).every((value) => value === false)).toBe(true)
  })
})
