import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'

export default function VenuesPage() {
  const { activeOrgId } = useOutletContext()
  const [venues, setVenues] = useState([])
  const [status, setStatus] = useState('loading')
  const [selected, setSelected] = useState(null)
  const [courts, setCourts] = useState([])
  const [newVenueName, setNewVenueName] = useState('')
  const [newCourtName, setNewCourtName] = useState('')
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  if (fetchKey !== activeOrgId) {
    setFetchKey(activeOrgId)
    setVenues([])
    setStatus('loading')
    setSelected(null)
    setCourts([])
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get('/api/pickleball/venues')
      .then((data) => {
        if (!ignore) {
          setVenues(data.venues)
          setStatus('ready')
        }
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [activeOrgId])

  useEffect(() => {
    if (!selected) {
      return
    }
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/courts?venueId=${selected.id}`)
      .then((data) => {
        if (!ignore) setCourts(data.courts)
      })
      .catch(() => {
        if (!ignore) setMessage({ type: 'error', text: 'Could not load courts.' })
      })
    return () => {
      ignore = true
    }
  }, [selected])

  async function handleCreateVenue() {
    setMessage(null)
    try {
      const { venue } = await pickleballApi.post('/api/pickleball/venues', { name: newVenueName })
      setVenues((current) => [...current, venue])
      setNewVenueName('')
      setCourts([])
      setSelected(venue)
      setMessage({ type: 'success', text: 'Venue added.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleAddCourt() {
    setMessage(null)
    try {
      const { court } = await pickleballApi.post('/api/pickleball/courts', { venueId: selected.id, name: newCourtName })
      setCourts((current) => [...current, court])
      setNewCourtName('')
      setMessage({ type: 'success', text: 'Court added.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Venues</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>

      {status === 'error' ? <p className="text-sm text-rose-600">Could not load venues.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2" data-testid="venues-list">
          {status === 'loading' ? (
            <SkeletonBlock>
              <SkeletonRows rows={4} />
            </SkeletonBlock>
          ) : null}
          {venues.map((venue) => (
            <button
              key={venue.id}
              type="button"
              onClick={() => {
                if (selected?.id !== venue.id) {
                  setCourts([])
                  setSelected(venue)
                }
              }}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${selected?.id === venue.id ? 'border-brand bg-brand/10 font-semibold' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
              {venue.name}
            </button>
          ))}
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              value={newVenueName}
              onChange={(event) => setNewVenueName(event.target.value)}
              placeholder="New venue name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="button" onClick={handleCreateVenue} disabled={!newVenueName.trim()} className="pb-btn-primary shrink-0 rounded-lg px-3 py-2 text-sm">
              Add
            </button>
          </div>
        </div>

        <div>
          {selected ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{selected.name} — Courts</h2>

              {message ? <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p> : null}

              <ul className="space-y-1" data-testid="courts-list">
                {courts.map((court) => (
                  <li key={court.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                    {court.name}
                  </li>
                ))}
                {!courts.length ? (
                  <li>
                    <EmptyState title="No courts yet." compact />
                  </li>
                ) : null}
              </ul>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCourtName}
                  onChange={(event) => setNewCourtName(event.target.value)}
                  placeholder="New court name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={handleAddCourt} disabled={!newCourtName.trim()} className="pb-btn-primary shrink-0 rounded-lg px-3 py-2 text-sm">
                  Add Court
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a venue to manage its courts.</p>
          )}
        </div>
      </div>
    </div>
  )
}
