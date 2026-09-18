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
 *   - OPERATIONAL SWITCHES. Editable here and stored in D1, but bounded by
 *     deployment-level Worker vars. The Worker vars remain the emergency stop;
 *     the UI cannot enable a capability the deployment has forbidden.
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

const FLAG_ROWS = [
  { key: 'engine', label: 'Engine (master switch)', varName: 'LEAD_ENGINE_ENABLED' },
  { key: 'discovery', label: 'Discovery', varName: 'LEAD_DISCOVERY_ENABLED' },
  { key: 'crawler', label: 'Crawler', varName: 'LEAD_CRAWLER_ENABLED' },
  { key: 'browserRun', label: 'Browser rendering fallback', varName: 'LEAD_BROWSER_RUN_ENABLED' },
  { key: 'ai', label: 'Workers AI', varName: 'LEAD_AI_ENABLED' },
  { key: 'tracking', label: 'First-party tracking', varName: 'LEAD_TRACKING_ENABLED' },
  { key: 'campaignSchedules', label: 'Campaign schedules', varName: 'LEAD_CAMPAIGN_SCHEDULES_ENABLED', confirm: true },
  { key: 'zohoMail', label: 'Zoho Mail', varName: 'ZOHO_MAIL_ENABLED' },
  { key: 'zohoMailSync', label: 'Zoho mailbox sync', varName: 'ZOHO_MAIL_SYNC_ENABLED', confirm: true },
]

function FlagRow({ item, state, busy, onToggle }) {
  const requested = Boolean(state.requested?.[item.key])
  const effective = Boolean(state.effective?.[item.key])
  const deploymentAllowed = Boolean(state.deployment?.engine && state.deployment?.[item.key])
  const disabled = busy || !state.available || !deploymentAllowed

  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">{item.label}</span>
          <Badge
            value={effective ? 'on' : 'off'}
            tones={{ on: 'bg-emerald-100 text-emerald-800', off: 'bg-slate-100 text-slate-500' }}
            label={effective ? 'On' : requested ? 'Armed' : 'Off'}
          />
        </div>
        <p className="mt-0.5 text-xs text-slate-400">
          <code>{item.varName}</code>
          {!deploymentAllowed ? ' · locked by deployment configuration' : ''}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={`${item.label} operational switch`}
        aria-checked={requested}
        disabled={disabled}
        onClick={() => onToggle(item, !requested)}
        className={`relative inline-flex h-6 w-11 flex-none rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
          requested ? 'bg-violet-600' : 'bg-slate-300'
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            requested ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function FeatureFlagsPanel() {
  const { data, state, reload } = useResource('/api/admin/lead-crm/feature-flags')
  const [busyKey, setBusyKey] = useState(null)
  const [feedback, setFeedback] = useState(null)

  async function toggle(item, enabled) {
    if (
      enabled &&
      item.confirm &&
      !window.confirm(
        item.key === 'campaignSchedules'
          ? 'Enable unattended campaign schedules? Individual campaigns must still be armed separately.'
          : 'Enable mailbox synchronization? This reads the configured Zoho Inbox and Sent folders.',
      )
    ) {
      return
    }

    setBusyKey(item.key)
    setFeedback(null)
    try {
      await adminApi.put('/api/admin/lead-crm/feature-flags', { key: item.key, enabled })
      setFeedback({ tone: 'ok', message: `${item.label} turned ${enabled ? 'on' : 'off'}.` })
      reload()
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <Panel
      title="Operational switches"
      description="Changes take effect immediately. Worker vars remain the deployment-level emergency stop."
    >
      {state === 'loading' ? <p className="text-sm text-slate-500">Loading switches…</p> : null}
      {data ? (
        <div>
          {FLAG_ROWS.map((item) => (
            <FlagRow key={item.key} item={item} state={data} busy={busyKey === item.key} onToggle={toggle} />
          ))}
        </div>
      ) : null}
      <Feedback feedback={feedback} />
      <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
        A deployment-locked switch cannot be enabled here. There is no automated-send switch: this system only
        creates Zoho drafts, and a person sends them.
      </p>
    </Panel>
  )
}

function SettingsPage() {
  const { data, state, reload } = useResource('/api/admin/lead-crm/settings')

  const settings = data?.settings ?? {}
  const metadata = data?.metadata ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Lead CRM settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Control live capabilities, thresholds, weights, budgets and business identity from one place.
        </p>
      </div>

      <FeatureFlagsPanel />

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
