import { useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { buttonClass, formatDate, humanize, inputClass, primaryButtonClass } from './format'
import { Badge, EmptyState, Feedback, Panel } from './shared'
import { useResource } from './useResource'

/**
 * Campaigns.
 *
 * The only place vertical-specific knowledge lives. A campaign holds the
 * country, the metros, the OSM tags and the search queries; the engine itself
 * names no industry.
 *
 * Two independent switches are surfaced separately and deliberately: STATUS
 * says the campaign is live, SCHEDULE says it may run unattended. A campaign
 * can be run by hand from here without ever arming the cron, which is exactly
 * the state the seeded dry-run campaign ships in.
 */

const STATUS_TONES = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  completed: 'bg-sky-100 text-sky-800',
  archived: 'bg-slate-100 text-slate-400',
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  countryCode: 'US',
  maxCandidates: 100,
  maxAiReviews: 40,
}

function CampaignForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSaving(true)
    setFeedback(null)
    try {
      const { campaign } = await adminApi.post('/api/admin/lead-crm/campaigns', {
        ...form,
        maxCandidates: Number(form.maxCandidates),
        maxAiReviews: Number(form.maxAiReviews),
      })
      onCreated(campaign)
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Feedback feedback={feedback} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-slate-600">Name</span>
          <input required value={form.name} onChange={update('name')} className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Slug</span>
          <input
            required
            value={form.slug}
            onChange={update('slug')}
            placeholder="us-property-management-dry-run"
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Country</span>
          <select value={form.countryCode} onChange={update('countryCode')} className={`${inputClass} mt-1 w-full`}>
            <option value="US">United States</option>
            <option value="PH">Philippines</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Candidate limit</span>
          <input
            type="number"
            min="0"
            value={form.maxCandidates}
            onChange={update('maxCandidates')}
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">AI review limit</span>
          <input
            type="number"
            min="0"
            value={form.maxAiReviews}
            onChange={update('maxAiReviews')}
            className={`${inputClass} mt-1 w-full`}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-slate-600">Description</span>
        <textarea
          rows={2}
          value={form.description}
          onChange={update('description')}
          className={`${inputClass} mt-1 w-full`}
        />
      </label>
      <p className="text-xs text-slate-500">
        Created as a draft with its schedule disarmed. Activating it and arming the schedule are separate, audited
        actions.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={isSaving} className={primaryButtonClass}>
          {isSaving ? 'Creating…' : 'Create campaign'}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function CampaignRow({ campaign, flags, onChanged, onImported }) {
  const [busy, setBusy] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [importFormat, setImportFormat] = useState('domains')
  const [importContent, setImportContent] = useState('')
  const [importFeedback, setImportFeedback] = useState(null)

  async function patch(changes, message) {
    setBusy('patch')
    setFeedback(null)
    try {
      const { campaign: updated } = await adminApi.patch(`/api/admin/lead-crm/campaigns/${campaign.id}`, changes)
      onChanged(updated)
      setFeedback({ tone: 'ok', message })
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusy(null)
    }
  }

  async function run(dryRun) {
    setBusy(dryRun ? 'dry' : 'run')
    setFeedback(null)
    try {
      const result = await adminApi.post(`/api/admin/lead-crm/campaigns/${campaign.id}/run`, { dryRun })
      setFeedback({
        tone: result.status === 'ok' ? 'ok' : 'warn',
        message:
          result.status === 'ok'
            ? `${result.created} new, ${result.duplicates} already known, from ${result.candidates} candidates.${dryRun ? ' Dry run — nothing was crawled.' : ''}`
            : `${humanize(result.status)}: ${result.reason || 'nothing ran'}.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusy(null)
    }
  }

  async function importCandidates(event) {
    event.preventDefault()
    setBusy('import')
    setImportFeedback(null)
    try {
      const result = await adminApi.post(`/api/admin/lead-crm/campaigns/${campaign.id}/import`, {
        format: importFormat,
        content: importContent,
      })
      const parseErrors = result.parseErrors?.length ?? 0
      const rejected = (result.rejected ?? 0) + parseErrors
      setImportFeedback({
        tone: rejected > 0 ? 'warn' : 'ok',
        message: `${result.created} new, ${result.duplicates} already known, ${rejected} rejected. Research was queued for the next manual or scheduled job run.`,
      })
      if (rejected === 0) setImportContent('')
      onImported()
    } catch (error) {
      setImportFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{campaign.name}</h3>
            <Badge value={campaign.status} tones={STATUS_TONES} />
            {campaign.scheduleEnabled ? (
              <Badge value="scheduled" tones={{ scheduled: 'bg-indigo-100 text-indigo-800' }} label="Scheduled" />
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {campaign.countryCode} · {campaign.slug} · {campaign.leadCount ?? 0} leads · last run{' '}
            {formatDate(campaign.lastRunAt)}
          </p>
          {campaign.description ? <p className="mt-2 text-sm text-slate-600">{campaign.description}</p> : null}
          {campaign.lastRunError ? (
            <p className="mt-2 text-xs text-rose-600">Last run failed: {campaign.lastRunError}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowImport((current) => !current)}
            disabled={busy !== null}
            className={primaryButtonClass}
          >
            {showImport ? 'Close import' : 'Import list'}
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy !== null || !flags?.discovery}
            className={buttonClass}
            title={!flags?.discovery ? 'Automated discovery is disabled. Manual import is still available.' : undefined}
          >
            {busy === 'dry' ? 'Running…' : 'Automated dry run'}
          </button>
          <button
            type="button"
            onClick={() => run(false)}
            disabled={busy !== null || campaign.status !== 'active' || !flags?.discovery}
            className={buttonClass}
            title={
              !flags?.discovery
                ? 'Automated discovery is disabled. Manual import is still available.'
                : campaign.status !== 'active'
                  ? 'Activate the campaign first.'
                  : undefined
            }
          >
            {busy === 'run' ? 'Running…' : 'Run discovery'}
          </button>
          {campaign.status === 'draft' || campaign.status === 'paused' ? (
            <button
              type="button"
              onClick={() => patch({ status: 'active' }, 'Campaign activated.')}
              disabled={busy !== null}
              className={primaryButtonClass}
            >
              Activate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => patch({ status: 'paused', scheduleEnabled: false }, 'Campaign paused.')}
              disabled={busy !== null}
              className={buttonClass}
            >
              Pause
            </button>
          )}
        </div>
      </div>

      <Feedback feedback={feedback} />

      {showImport ? (
        <form onSubmit={importCandidates} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-slate-600">Import format</span>
              <select
                value={importFormat}
                onChange={(event) => setImportFormat(event.target.value)}
                className={`${inputClass} mt-1 w-full`}
              >
                <option value="domains">Domains or URLs</option>
                <option value="csv">CSV</option>
              </select>
            </label>
            <p className="max-w-2xl text-xs text-slate-500">
              {importFormat === 'domains'
                ? 'Enter one business domain or website URL per line. Blank lines and lines beginning with # are ignored.'
                : 'Include a header row and a Website, URL, or Domain column. Optional columns include company name, email, phone, city, region, country, and category.'}
            </p>
          </div>
          <textarea
            required
            rows={6}
            value={importContent}
            onChange={(event) => setImportContent(event.target.value)}
            placeholder={importFormat === 'domains' ? 'example.com\nhttps://another-example.com' : 'Company,Website\nExample,example.com'}
            className={`${inputClass} w-full font-mono text-xs`}
          />
          <Feedback feedback={importFeedback} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy !== null || !importContent.trim()} className={primaryButtonClass}>
              {busy === 'import' ? 'Importing…' : 'Import candidates'}
            </button>
            <span className="text-xs text-slate-500">
              Importing creates lead records only. It does not crawl websites, run AI, create Zoho drafts, or send email.
            </span>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={campaign.scheduleEnabled}
            disabled={busy !== null || campaign.status !== 'active'}
            onChange={(event) =>
              patch(
                { scheduleEnabled: event.target.checked },
                event.target.checked ? 'Schedule armed.' : 'Schedule disarmed.',
              )
            }
          />
          <span className="text-slate-600">
            Run on the daily schedule
            {campaign.status !== 'active' ? ' (activate the campaign first)' : ''}
          </span>
        </label>
        <span className="text-slate-400">
          Limits: {campaign.maxCandidates} candidates, {campaign.maxAiReviews} AI reviews
        </span>
      </div>
    </div>
  )
}

function CampaignsPage() {
  const { data, state, reload, setData } = useResource('/api/admin/lead-crm/campaigns')
  const [isCreating, setIsCreating] = useState(false)

  const campaigns = data?.campaigns ?? []

  function handleChanged(updated) {
    setData((current) => ({
      ...current,
      campaigns: current.campaigns.map((campaign) => (campaign.id === updated.id ? { ...campaign, ...updated } : campaign)),
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each campaign holds its own country, metros, sources and vocabulary. The engine is vertical-agnostic.
          </p>
        </div>
        <button type="button" onClick={() => setIsCreating((current) => !current)} className={primaryButtonClass}>
          {isCreating ? 'Close' : 'New campaign'}
        </button>
      </div>

      {isCreating ? (
        <Panel title="New campaign">
          <CampaignForm
            onCancel={() => setIsCreating(false)}
            onCreated={() => {
              setIsCreating(false)
              reload()
            }}
          />
        </Panel>
      ) : null}

      {state === 'loading' ? <p className="text-sm text-slate-500">Loading campaigns…</p> : null}
      {state === 'error' ? <p className="text-sm text-rose-600">Campaigns could not be loaded.</p> : null}

      {state === 'ready' && campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet." hint="Create one to define a market, its sources and its vocabulary." />
      ) : null}

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <CampaignRow
            key={campaign.id}
            campaign={campaign}
            flags={data?.flags}
            onChanged={handleChanged}
            onImported={reload}
          />
        ))}
      </div>
    </div>
  )
}

export default CampaignsPage
