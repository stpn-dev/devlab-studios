import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pickleballApi, describeApiError } from '../lib/pickleballApi'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'
import SelectItemGraphic from '../components/illustrations/SelectItemGraphic'

const EMPTY_PLAYER = { id: null, displayName: '' }

export default function PlayersPage() {
  const [players, setPlayers] = useState([])
  const [status, setStatus] = useState('loading')
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState(null)
  // The roster is paged server-side, so the page tracks where it is in the
  // list and how many there are in total. `search` is what makes a cap
  // usable: with a few hundred players, "next page" alone is not a way to
  // find somebody.
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    let ignore = false
    // Debounced: typing a name should not fire a request per keystroke.
    const handle = setTimeout(() => {
      const query = new URLSearchParams({ offset: String(offset) })
      if (search.trim()) query.set('search', search.trim())

      pickleballApi
        .get(`/api/pickleball/players?${query.toString()}`)
        .then((data) => {
          if (ignore) return
          setPlayers(data.players)
          setTotal(data.total ?? data.players.length)
          setHasMore(Boolean(data.hasMore))
          setStatus('ready')
        })
        .catch(() => !ignore && setStatus('error'))
    }, search ? 250 : 0)

    return () => {
      ignore = true
      clearTimeout(handle)
    }
  }, [search, offset])

  function startNew() {
    setSelected({ ...EMPTY_PLAYER })
    setMessage(null)
  }

  function selectPlayer(player) {
    setSelected({ ...player })
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
      setMessage({ type: 'error', text: describeApiError(error) })
    }
  }

  // Retiring somebody who has played. Deleting them is refused by the API
  // because it would cascade their finished games and pairing history away,
  // so this is the route for "they don't come any more".
  async function handleToggleActive() {
    const nextActive = !selected.active
    setMessage(null)
    setIsBusy(true)
    try {
      const { player } = await pickleballApi.put(`/api/pickleball/players/${selected.id}`, { active: nextActive })
      // This list only holds active players, so a deactivated one leaves it.
      setPlayers((current) => (nextActive
        ? current.map((p) => (p.id === player.id ? player : p))
        : current.filter((p) => p.id !== player.id)))
      if (!nextActive) setTotal((current) => Math.max(current - 1, 0))
      setSelected(player)
      setMessage({
        type: 'success',
        text: nextActive
          ? `${player.displayName} is active again.`
          : `${player.displayName} was deactivated and is off the roster list. Their games and OPI are kept.`,
      })
    } catch (error) {
      setMessage({ type: 'error', text: describeApiError(error) })
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Permanently delete “${selected.displayName}”? This cannot be undone. It is only allowed while the player has no session or game history.`)) return

    setMessage(null)
    setIsBusy(true)
    try {
      await pickleballApi.delete(`/api/pickleball/players/${selected.id}`)
      setPlayers((current) => current.filter((p) => p.id !== selected.id))
      setTotal((current) => Math.max(current - 1, 0))
      setMessage({ type: 'success', text: `${selected.displayName} was deleted.` })
      setSelected(null)
    } catch (error) {
      // A 409 carries the specific reason (in a live session, or has history)
      // and the suggestion to deactivate instead — surface it as-is.
      setMessage({ type: 'error', text: describeApiError(error) })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Players</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        </div>
        <button type="button" onClick={startNew} className="pb-btn-primary rounded-lg px-4 py-2 text-sm">
          Add Player
        </button>
      </div>

      {status === 'error' ? <p className="text-sm text-rose-600">Could not load players.</p> : null}

      {/* Page level rather than inside the edit panel: a successful delete
          clears the selection, which would unmount an in-panel message before
          it could be read. */}
      {message ? (
        <p
          data-testid="players-message"
          className={message.type === 'success'
            ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
            : 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid max-w-3xl gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2" data-testid="players-list">
          <input
            type="search"
            value={search}
            data-testid="players-search"
            onChange={(event) => { setSearch(event.target.value); setOffset(0) }}
            placeholder="Search players"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
          />
          {status === 'loading' ? (
            <SkeletonBlock>
              <SkeletonRows rows={5} />
            </SkeletonBlock>
          ) : (
            <>
              {players.map((player) => (
                <div key={player.id} className="flex items-center gap-2">
                  <Link
                    to={player.id}
                    className={`block flex-1 rounded-lg border px-3 py-2 text-left text-sm ${selected?.id === player.id ? 'border-brand bg-brand/10 font-semibold text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  >
                    {player.displayName}
                  </Link>
                  <button
                    type="button"
                    onClick={() => selectPlayer(player)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-500 hover:border-slate-300"
                  >
                    Edit
                  </button>
                </div>
              ))}
              {!players.length && status === 'ready' ? (
                search.trim() ? (
                  <p className="px-1 py-4 text-sm text-slate-500" data-testid="players-no-match">
                    No players match “{search.trim()}”.
                  </p>
                ) : (
                  <EmptyState title="No players yet." description="Add your first player to start building your roster." action={{ label: 'Add Player', onClick: startNew }} />
                )
              ) : null}

              {/* Only shown once there is more than one page: with a small
                  roster this control would be noise. */}
              {total > players.length || offset > 0 ? (
                <div className="flex items-center justify-between gap-2 pt-2 text-xs text-slate-500" data-testid="players-pagination">
                  <span>
                    {offset + 1}–{offset + players.length} of {total}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      data-testid="players-prev"
                      disabled={offset === 0}
                      onClick={() => setOffset((current) => Math.max(current - players.length, 0))}
                      className="rounded-lg border border-slate-200 px-2 py-1 font-medium hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      data-testid="players-next"
                      disabled={!hasMore}
                      onClick={() => setOffset((current) => current + players.length)}
                      className="rounded-lg border border-slate-200 px-2 py-1 font-medium hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </span>
                </div>
              ) : null}
            </>
          )}
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

              <button type="button" onClick={handleSave} disabled={isBusy} className="pb-btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-60">
                Save
              </button>

              {selected.id ? (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleToggleActive}
                      disabled={isBusy}
                      data-testid="player-toggle-active"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selected.active === false ? 'Reactivate' : 'Deactivate'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isBusy}
                      data-testid="player-delete"
                      className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Deleting only works while a player has never been added to a session — it is for
                    fixing a duplicate or a typo. To take a regular player off the roster, deactivate
                    them: their finished games and OPI stay intact.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No player selected"
              description="Add a new player, or click Edit next to a player in the list to update their name."
              illustration={SelectItemGraphic}
            />
          )}
        </div>
      </div>
    </div>
  )
}
