import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

const EMPTY_FORM = { venueId: '', name: '', sessionType: 'OPEN_PLAY', scoringRulesetId: '', scheduledStart: '', scheduledEnd: '' }

export default function SessionsListPage() {
  const [sessions, setSessions] = useState([])
  const [venues, setVenues] = useState([])
  const [rulesets, setRulesets] = useState([])
  const [status, setStatus] = useState('loading')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let ignore = false
    Promise.all([
      pickleballApi.get('/api/pickleball/sessions'),
      pickleballApi.get('/api/pickleball/venues'),
      pickleballApi.get('/api/pickleball/scoring-rulesets'),
    ])
      .then(([sessionsData, venuesData, rulesetsData]) => {
        if (ignore) return
        setSessions(sessionsData.sessions)
        setVenues(venuesData.venues)
        setRulesets(rulesetsData.rulesets)
        setStatus('ready')
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [])

  async function handleCreate() {
    setMessage(null)
    try {
      const payload = {
        ...form,
        scheduledStart: new Date(form.scheduledStart).toISOString(),
        scheduledEnd: new Date(form.scheduledEnd).toISOString(),
      }
      const { session } = await pickleballApi.post('/api/pickleball/sessions', payload)
      setSessions((current) => [session, ...current])
      setForm(EMPTY_FORM)
      setShowForm(false)
      setMessage({ type: 'success', text: 'Session created.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sessions</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="pb-btn-primary rounded-lg px-4 py-2 text-sm">
          New Session
        </button>
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load sessions.</p> : null}
      {message ? <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p> : null}

      {showForm ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Name</span>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Venue</span>
            <select data-testid="session-venue-select" value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select a venue</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Scoring ruleset</span>
            <select data-testid="session-ruleset-select" value={form.scoringRulesetId} onChange={(e) => setForm({ ...form, scoringRulesetId: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select a ruleset</option>
              {rulesets.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Start</span>
            <input type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">End</span>
            <input type="datetime-local" value={form.scheduledEnd} onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!form.name.trim() || !form.venueId || !form.scoringRulesetId || !form.scheduledStart || !form.scheduledEnd}
            className="pb-btn-primary rounded-lg px-4 py-2 text-sm"
          >
            Create
          </button>
        </div>
      ) : null}

      <div className="space-y-2" data-testid="sessions-list">
        {sessions.map((session) => (
          <Link
            key={session.id}
            to={`/pickleball/app/sessions/${session.id}`}
            className="flex items-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm hover:border-brand/40"
          >
            <span className="font-semibold text-slate-900">{session.name}</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{session.status}</span>
          </Link>
        ))}
        {!sessions.length && status === 'ready' ? <p className="text-sm text-slate-500">No sessions yet.</p> : null}
      </div>
    </div>
  )
}
