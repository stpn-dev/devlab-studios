import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonLine } from '../components/SkeletonLoader'
import EmptySessionGraphic from '../components/illustrations/EmptySessionGraphic'
import SessionStatusChip from '../components/SessionStatusChip'

const EMPTY_FORM = { venueId: '', name: '', sessionType: 'OPEN_PLAY', scoringRulesetId: '', scheduledStart: '', scheduledEnd: '' }

// scheduledStart/scheduledEnd are the only real per-session date/time fields
// this page's fetch provides (listSessions() in
// src/worker/repositories/pickleball/sessions.js) -- registered/checked-in/
// court counts are NOT part of this response (no per-session player/court
// aggregate is fetched here), so this task's session cards show real
// date/time + venue + status only, and omit those counts as a genuine
// backend-boundary gap rather than fabricating them.
function formatSessionWindow(startIso, endIso) {
  if (!startIso) return null
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : null
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  const datePart = dateFormatter.format(start)
  const startTime = timeFormatter.format(start)
  if (!end) return `${datePart}, ${startTime}`
  const sameDay = start.toDateString() === end.toDateString()
  const endTime = timeFormatter.format(end)
  return sameDay ? `${datePart}, ${startTime}–${endTime}` : `${datePart} ${startTime} – ${dateFormatter.format(end)} ${endTime}`
}

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

      <div className="space-y-3" data-testid="sessions-list">
        {status === 'loading' ? (
          <SkeletonBlock>
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="pb-metric-card space-y-2 p-4">
                  <SkeletonLine className="h-4 w-1/3" />
                  <SkeletonLine className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </SkeletonBlock>
        ) : (
          <>
            {sessions.map((session) => {
              const venueName = venues.find((v) => v.id === session.venueId)?.name
              const scheduleWindow = formatSessionWindow(session.scheduledStart, session.scheduledEnd)
              return (
                <Link
                  key={session.id}
                  to={`/pickleball/app/sessions/${session.id}`}
                  className="pb-metric-card flex flex-col gap-3 p-4 text-sm no-underline hover:border-brand/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{session.name}</span>
                      <SessionStatusChip status={session.status} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {venueName ? `${venueName} · ` : ''}
                      {scheduleWindow || 'No schedule set'}
                    </p>
                  </div>
                  <span className="pb-btn-primary inline-flex flex-shrink-0 items-center justify-center rounded-lg px-4 py-2 text-xs">
                    Open Control Center
                  </span>
                </Link>
              )
            })}
            {!sessions.length && status === 'ready' ? (
              <EmptyState
                title="No sessions yet."
                description="Create a session to start checking players in and running games."
                illustration={EmptySessionGraphic}
                action={{ label: 'New Session', onClick: () => setShowForm(true) }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
