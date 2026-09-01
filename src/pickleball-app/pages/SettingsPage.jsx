import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

const FORMATS = ['DOUBLES', 'SINGLES']
const EMPTY_FORM = { name: '', targetScore: 11, winBy: 2, format: 'DOUBLES' }

export default function SettingsPage() {
  const { activeOrgId } = useOutletContext()
  const [rulesets, setRulesets] = useState([])
  const [status, setStatus] = useState('loading')
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  if (fetchKey !== activeOrgId) {
    setFetchKey(activeOrgId)
    setRulesets([])
    setStatus('loading')
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get('/api/pickleball/scoring-rulesets?scope=organization')
      .then((data) => {
        if (!ignore) {
          setRulesets(data.rulesets)
          setStatus('ready')
        }
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [activeOrgId])

  async function handleCreate() {
    setMessage(null)
    try {
      const { ruleset } = await pickleballApi.post('/api/pickleball/scoring-rulesets', {
        ...form,
        targetScore: Number(form.targetScore),
        winBy: Number(form.winBy),
      })
      setRulesets((current) => [...current, ruleset])
      setForm(EMPTY_FORM)
      setMessage({ type: 'success', text: 'Scoring ruleset created.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleToggleActive(ruleset) {
    setMessage(null)
    try {
      const { ruleset: updated } = await pickleballApi.put(`/api/pickleball/scoring-rulesets/${ruleset.id}`, {
        active: !ruleset.active,
      })
      setRulesets((current) => current.map((r) => (r.id === updated.id ? updated : r)))
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>
      <p className="text-sm text-slate-500">
        Custom scoring rulesets for this organization. New sessions can pick any active ruleset here, plus the
        built-in defaults every organization shares.
      </p>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load scoring rulesets.</p> : null}
      {message ? <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p> : null}

      <div className="space-y-2" data-testid="scoring-rulesets-list">
        {rulesets.map((ruleset) => (
          <div key={ruleset.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <div>
              <span className="font-semibold text-slate-900">{ruleset.name}</span>
              <span className="ml-2 text-xs text-slate-500">
                {ruleset.format} · to {ruleset.targetScore}, win by {ruleset.winBy}
              </span>
              {!ruleset.active ? (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactive</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => handleToggleActive(ruleset)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-300"
            >
              {ruleset.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        ))}
        {!rulesets.length && status === 'ready' ? <p className="text-sm text-slate-500">No custom rulesets yet.</p> : null}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add a scoring ruleset</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Target score</span>
            <input
              type="number"
              min="1"
              value={form.targetScore}
              onChange={(event) => setForm({ ...form, targetScore: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Win by</span>
            <input
              type="number"
              min="1"
              value={form.winBy}
              onChange={(event) => setForm({ ...form, winBy: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Format</span>
            <select
              value={form.format}
              onChange={(event) => setForm({ ...form, format: event.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {FORMATS.map((format) => (
                <option key={format} value={format}>{format}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!form.name.trim()}
          className="pb-btn-primary rounded-lg px-4 py-2 text-sm"
        >
          Add ruleset
        </button>
      </div>
    </div>
  )
}
