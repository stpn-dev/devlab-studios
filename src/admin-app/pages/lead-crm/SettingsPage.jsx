import { useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { buttonClass, formatDate, humanize, inputClass, primaryButtonClass, relativeTime } from './format'
import { Badge, Feedback, Panel } from './shared'
import { useResource } from './useResource'

/**
 * Lead CRM settings.
 *
 * Two things live here and are kept visually separate because they behave
 * differently:
 *
 *   - TUNABLES (thresholds, weights, budgets, crawler limits, business
 *     identity). Editable, stored in D1, layered over the code defaults. A
 *     "Reset" removes the override and restores the default rather than
 *     writing the default back — so a later change to the default is picked up.
 *   - INTEGRATION STATUS (Zoho, feature flags). Read-only here. Flags are
 *     Worker vars, deliberately: a flag is how you stop the engine, and it must
 *     not depend on the database the engine is failing against.
 *
 * No credential value is ever rendered. The API masks anything marked secret
 * before it leaves the Worker, so it is not in the page source or the network
 * tab either.
 */

function SettingEditor({ settingKey, value, metadata, onSaved }) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2))
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [isOpen, setIsOpen] = useState(false)

  const override = metadata.find((entry) => entry.key === settingKey)

  async function save() {
    setBusy(true)
    setFeedback(null)
    try {
      const parsed = JSON.parse(draft)
      await adminApi.put('/api/admin/lead-crm/settings', { key: settingKey, value: parsed })
      setFeedback({ tone: 'ok', message: 'Saved.' })
      onSaved()
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof SyntaxError ? 'That is not valid JSON.' : error.message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setFeedback(null)
    try {
      await adminApi.delete(`/api/admin/lead-crm/settings?key=${encodeURIComponent(settingKey)}`)
      setFeedback({ tone: 'ok', message: 'Override removed — the built-in default applies again.' })
      onSaved()
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  const isMasked = typeof value === 'string' && value.startsWith('••••')

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="font-mono text-xs text-slate-700">{settingKey}</span>
        <span className="flex items-center gap-2">
          {override ? (
            <Badge value="overridden" tones={{ overridden: 'bg-sky-100 text-sky-800' }} label="Overridden" />
          ) : (
            <Badge value="default" tones={{ default: 'bg-slate-100 text-slate-500' }} label="Default" />
          )}
          <span className="text-xs text-slate-400">{isOpen ? '−' : '+'}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="space-y-2 border-t border-slate-200 p-3">
          {isMasked ? (
            <p className="text-xs text-slate-500">This value is masked and cannot be viewed here.</p>
          ) : (
            <textarea
              rows={Math.min(16, draft.split('\n').length + 1)}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={`${inputClass} w-full font-mono text-xs`}
            />
          )}

          <Feedback feedback={feedback} />

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || isMasked} className={primaryButtonClass} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {override ? (
              <button type="button" disabled={busy} className={buttonClass} onClick={reset}>
                Reset to default
              </button>
            ) : null}
            {override ? (
              <span className="text-xs text-slate-400">
                Last changed {formatDate(override.updatedAt)} by {override.updatedBy || 'unknown'}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ZohoStatus() {
  const { data, state, reload } = useResource('/api/admin/lead-crm/zoho/status')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  if (state === 'loading') return <p className="text-sm text-slate-500">Checking Zoho…</p>
  if (!data) return null

  async function syncNow() {
    setBusy(true)
    setFeedback(null)
    try {
      const result = await adminApi.post('/api/admin/lead-crm/zoho/status', { action: 'sync_now' })
      setFeedback({
        tone: 'ok',
        message: `Sent: ${result.sent.status} (${result.sent.imported} imported). Inbox: ${result.inbox.status} (${result.inbox.imported} imported).`,
      })
      reload()
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Zoho Mail"
      description="The human-controlled communication interface. This application saves drafts; it has no send capability."
      actions={
        data.configured ? (
          <button type="button" disabled={busy} className={buttonClass} onClick={syncNow}>
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
        ) : null
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            value={data.connection.ok ? 'connected' : 'not_connected'}
            tones={{ connected: 'bg-emerald-100 text-emerald-800', not_connected: 'bg-rose-100 text-rose-800' }}
            label={data.connection.ok ? 'Connected' : 'Not connected'}
          />
          <Badge
            value={data.flags.zohoMailSync ? 'sync_on' : 'sync_off'}
            tones={{ sync_on: 'bg-emerald-100 text-emerald-800', sync_off: 'bg-slate-100 text-slate-500' }}
            label={data.flags.zohoMailSync ? 'Sync enabled' : 'Sync disabled'}
          />
          {data.mailbox ? <span className="text-xs text-slate-500">{data.mailbox}</span> : null}
        </div>

        {!data.configured ? (
          <p className="text-xs text-slate-500">
            Missing configuration: <code className="rounded bg-slate-100 px-1">{data.missing.join(', ')}</code>. See
            docs/lead-engine/zoho-integration.md for the one-time OAuth setup.
          </p>
        ) : null}

        {!data.connection.ok && data.configured ? (
          <p className="text-xs text-rose-600">{data.connection.detail}</p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {data.syncState.map((sync) => (
            <div key={`${sync.folder}`} className="rounded border border-slate-200 p-2 text-xs">
              <p className="font-semibold text-slate-700">{humanize(sync.folder)}</p>
              <p className="text-slate-500">Last success: {relativeTime(sync.lastSuccessAt)}</p>
              <p className="text-slate-500">
                {sync.messagesImported} imported of {sync.messagesSeen} examined
              </p>
              {sync.consecutiveFailures > 0 ? (
                <p className="mt-1 text-rose-600">
                  {sync.consecutiveFailures} consecutive failures — {sync.lastError}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400">Messages imported today: {data.messagesImportedToday}</p>

        <Feedback feedback={feedback} />
      </div>
    </Panel>
  )
}

function FlagRow({ label, enabled, varName }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <div>
        <span className="text-slate-700">{label}</span>
        <code className="ml-2 rounded bg-slate-100 px-1 text-xs text-slate-500">{varName}</code>
      </div>
      <Badge
        value={enabled ? 'on' : 'off'}
        tones={{ on: 'bg-emerald-100 text-emerald-800', off: 'bg-slate-100 text-slate-500' }}
        label={enabled ? 'On' : 'Off'}
      />
    </div>
  )
}

function SettingsPage() {
  const { data, state, reload } = useResource('/api/admin/lead-crm/settings')
  const { data: dashboard } = useResource('/api/admin/lead-crm/dashboard')

  const settings = data?.settings ?? {}
  const metadata = data?.metadata ?? []
  const flags = dashboard?.flags

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lead CRM settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Thresholds, weights, budgets and identity. Feature flags are Worker vars, not database rows — a switch that
          stops the engine must not depend on the database.
        </p>
      </div>

      {flags ? (
        <Panel title="Feature flags" description="Read-only here. Set these as Cloudflare Worker vars.">
          <FlagRow label="Engine (master switch)" enabled={flags.engine} varName="LEAD_ENGINE_ENABLED" />
          <FlagRow label="Discovery" enabled={flags.discovery} varName="LEAD_DISCOVERY_ENABLED" />
          <FlagRow label="Crawler" enabled={flags.crawler} varName="LEAD_CRAWLER_ENABLED" />
          <FlagRow label="Browser rendering fallback" enabled={flags.browserRun} varName="LEAD_BROWSER_RUN_ENABLED" />
          <FlagRow label="Workers AI" enabled={flags.ai} varName="LEAD_AI_ENABLED" />
          <FlagRow label="First-party tracking" enabled={flags.tracking} varName="LEAD_TRACKING_ENABLED" />
          <FlagRow label="Campaign schedules" enabled={flags.campaignSchedules} varName="LEAD_CAMPAIGN_SCHEDULES_ENABLED" />
          <FlagRow label="Zoho Mail" enabled={flags.zohoMail} varName="ZOHO_MAIL_ENABLED" />
          <FlagRow label="Zoho mailbox sync" enabled={flags.zohoMailSync} varName="ZOHO_MAIL_SYNC_ENABLED" />
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
            There is no automated-send flag. This system has no send capability: it writes Zoho drafts and a person
            sends them.
          </p>
        </Panel>
      ) : null}

      <ZohoStatus />

      <Panel
        title="Tunables"
        description="Stored overrides layered over the code defaults in src/lead-engine/config/defaults.js."
      >
        {state === 'loading' ? <p className="text-sm text-slate-500">Loading settings…</p> : null}
        <div className="space-y-2">
          {Object.entries(settings).map(([key, value]) => (
            <SettingEditor key={key} settingKey={key} value={value} metadata={metadata} onSaved={reload} />
          ))}
        </div>
      </Panel>
    </div>
  )
}

export default SettingsPage
