import { useEffect, useState } from 'react'
import { pickleballApi } from '../lib/pickleballApi'

const EMPTY_PLAYER = { id: null, displayName: '' }

export default function PlayersPage() {
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get('/api/pickleball/players')
      .then((data) => {
        if (!ignore) {
          setPlayers(data.players)
          setStatus('ready')
        }
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [])

  function startNew() {
    setSelected({ ...EMPTY_PLAYER })
    setMessage(null)
  }

  function selectPlayer(player) {
    setSelected(player)
    setMessage(null)
  }

  async function handleSave() {
    setMessage(null)
    try {
      if (selected.id) {
        const { player } = await pickleballApi.put(`/api/pickleball/players/${selected.id}`, { displayName: selected.displayName })
        setPlayers((current) => current.map((p) => (p.id === player.id ? player : p)))
        setSelected(player)
      } else {
        const { player } = await pickleballApi.post('/api/pickleball/players', { displayName: selected.displayName })
        setPlayers((current) => [...current, player])
        setSelected(player)
      }
      setMessage({ type: 'success', text: 'Saved.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Players</h1>
        <button type="button" onClick={startNew} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-95">
          Add Player
        </button>
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load players.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2" data-testid="players-list">
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => selectPlayer(player)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${selected?.id === player.id ? 'border-brand bg-brand/10 font-semibold' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
              {player.displayName}
            </button>
          ))}
          {!players.length && status === 'ready' ? <p className="text-sm text-slate-500">No players yet.</p> : null}
        </div>

        <div>
          {selected ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Display name</span>
                <input
                  type="text"
                  value={selected.displayName}
                  onChange={(event) => setSelected({ ...selected, displayName: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              {message ? <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p> : null}

              <button type="button" onClick={handleSave} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-95">
                Save
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a player to edit, or add a new one.</p>
          )}
        </div>
      </div>
    </div>
  )
}
