import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi, describeApiError } from '../lib/pickleballApi'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'
import { humanizeEnum } from '../lib/humanizeEnum'
import { Trophy, Lock } from '../../components/icons/icons'

// Fixture rows grouped by round_number, in ascending round order -- the
// "grouped by round" shape this task's own brief names. Fixtures within a
// round keep whatever order listFixtures already returned them in
// (bracket, round_number, position), so this only needs to bucket, not sort
// within a bucket.
function groupFixturesByRound(fixtures) {
  const groups = new Map()
  for (const fixture of fixtures) {
    const bucket = groups.get(fixture.roundNumber) || []
    bucket.push(fixture)
    groups.set(fixture.roundNumber, bucket)
  }
  return [...groups.entries()].sort(([a], [b]) => a - b)
}

function formatDifferential(value) {
  return value > 0 ? `+${value}` : `${value}`
}

export default function TournamentPage() {
  const { sessionId, session, onSessionUpdated } = useOutletContext()
  const [entrants, setEntrants] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [standings, setStandings] = useState([])
  const [pairs, setPairs] = useState([])
  const [selectedPairId, setSelectedPairId] = useState('')
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  // Render-phase reset (LeaderboardPage.jsx's own pattern) -- switching
  // sessions must clear the previous session's tournament data in the same
  // render, never via a setState call inside the effect body (the repo's
  // ESLint forbids that).
  if (fetchKey !== sessionId) {
    setFetchKey(sessionId)
    setEntrants([])
    setFixtures([])
    setStandings([])
    setPairs([])
    setSelectedPairId('')
    setMessage(null)
    setStatus('loading')
  }

  async function reload() {
    const [entrantsData, fixturesData, standingsData, pairsData] = await Promise.all([
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/tournament/entrants`),
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/tournament/fixtures`),
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/tournament/standings`),
      pickleballApi.get(`/api/pickleball/sessions/${sessionId}/pairs`),
    ])
    setEntrants(entrantsData.entrants)
    setFixtures(fixturesData.fixtures)
    setStandings(standingsData.standings)
    setPairs(pairsData.pairs)
    setStatus('ready')
  }

  useEffect(() => {
    let ignore = false
    reload().catch(() => {
      if (!ignore) setStatus('error')
    })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const isLocked = Boolean(session?.bracketLockedAt)
  const enteredPairIds = new Set(entrants.map((entrant) => entrant.sessionPairId))
  const enterablePairs = pairs.filter((pair) => !enteredPairIds.has(pair.id))

  async function handleEnterPair() {
    if (!selectedPairId) return
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/tournament/entrants`, { sessionPairId: selectedPairId })
      setSelectedPairId('')
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: describeApiError(error) })
    }
  }

  async function handleWithdrawEntrant(entrantId) {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/tournament/entrants/${entrantId}/withdraw`, {})
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: describeApiError(error) })
    }
  }

  async function handleLockBracket() {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/sessions/${sessionId}/tournament/lock`, {})
      // lockBracket's broadcast updates the realtime snapshot (queue/courts/
      // games), but bracket_locked_at is a SESSION-level column, not part of
      // that per-entity snapshot -- SessionLayout's own `session` state (the
      // thing `isLocked` reads) is otherwise a one-time fetch from mount, so
      // without this it would go stale the instant the bracket locks. Refetch
      // and push it back up through the same onSessionUpdated callback
      // SessionLayout already uses for its own rename flow.
      const { session: updatedSession } = await pickleballApi.get(`/api/pickleball/sessions/${sessionId}`)
      onSessionUpdated(updatedSession)
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: describeApiError(error) })
    }
  }

  const roundGroups = groupFixturesByRound(fixtures)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
          <Trophy className="h-5 w-5 text-brand" aria-hidden="true" />
          Tournament
        </h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        {session?.tournamentFormat ? (
          <p className="mt-2 text-sm text-slate-500">
            {humanizeEnum(session.tournamentFormat)} &middot; {isLocked ? 'Bracket locked' : 'Bracket open for entries'}
          </p>
        ) : null}
      </div>

      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}

      {status === 'loading' ? (
        <SkeletonBlock>
          <SkeletonRows rows={4} />
        </SkeletonBlock>
      ) : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load tournament data.</p> : null}

      {status === 'ready' ? (
        <>
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Entrants</h2>
              {isLocked ? (
                <span className="pb-status-chip pb-status-chip--muted inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Locked
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedPairId}
                onChange={(event) => setSelectedPairId(event.target.value)}
                disabled={isLocked}
                data-testid="tournament-enter-pair-select"
                className="min-w-[14rem] rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select a pair&hellip;</option>
                {enterablePairs.map((pair) => (
                  <option key={pair.id} value={pair.id}>
                    {pair.playerADisplayName} / {pair.playerBDisplayName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleEnterPair}
                disabled={isLocked || !selectedPairId}
                data-testid="tournament-enter-pair-button"
                className="pb-btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enter pair
              </button>
              {!isLocked ? (
                <button
                  type="button"
                  onClick={handleLockBracket}
                  disabled={entrants.length < 2}
                  data-testid="tournament-lock-bracket-button"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Lock bracket
                </button>
              ) : null}
            </div>

            <div className="space-y-1.5" data-testid="tournament-entrants-list">
              {entrants.map((entrant) => {
                const isWithdrawn = entrant.status === 'WITHDRAWN'
                return (
                  <div
                    key={entrant.id}
                    data-testid={`tournament-entrant-${entrant.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span className={`font-medium ${isWithdrawn ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {entrant.displayName}
                    </span>
                    <span className="flex items-center gap-2">
                      {isWithdrawn ? (
                        <span className="pb-status-chip pb-status-chip--muted" data-testid={`tournament-entrant-withdrawn-${entrant.id}`}>
                          Withdrawn
                        </span>
                      ) : (
                        <span className="pb-score text-xs text-slate-400">{entrant.seed ? `Seed ${entrant.seed}` : 'Unseeded'}</span>
                      )}
                      {isLocked && !isWithdrawn ? (
                        <button
                          type="button"
                          onClick={() => handleWithdrawEntrant(entrant.id)}
                          data-testid={`tournament-withdraw-entrant-${entrant.id}`}
                          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50"
                        >
                          Withdraw
                        </button>
                      ) : null}
                    </span>
                  </div>
                )
              })}
              {!entrants.length ? (
                <EmptyState title="No entrants yet." description="Enter formed pairs above to build the bracket." compact />
              ) : null}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="tournament-fixtures">
            <h2 className="text-lg font-bold text-slate-900">Fixtures</h2>
            {roundGroups.map(([roundNumber, roundFixtures]) => (
              <div key={roundNumber} className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Round {roundNumber}</h3>
                {roundFixtures.map((fixture) => (
                  <div
                    key={fixture.id}
                    data-testid={`tournament-fixture-${fixture.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-slate-700">
                      {fixture.entrantADisplayName ?? 'TBD'} <span className="text-slate-400">vs</span> {fixture.entrantBDisplayName ?? 'TBD'}
                    </span>
                    <span className="pb-status-chip pb-status-chip--info flex-shrink-0">{humanizeEnum(fixture.status)}</span>
                  </div>
                ))}
              </div>
            ))}
            {!fixtures.length ? (
              <EmptyState title="No fixtures yet." description="Fixtures are generated once the bracket is locked." compact />
            ) : null}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="tournament-standings">
            <h2 className="text-lg font-bold text-slate-900">Standings</h2>
            {standings.length ? (
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold">#</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">Entrant</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold">W&ndash;L</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold" title="Points for minus points against">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((entry) => (
                    <tr key={entry.entrantId} data-testid={`tournament-standing-${entry.entrantId}`} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{entry.rank}</td>
                      <td className="px-2 py-1.5 text-left font-medium text-slate-900">
                        {entry.displayName}
                        {entry.status === 'WITHDRAWN' ? (
                          <span
                            className="pb-status-chip pb-status-chip--muted ml-2 align-middle"
                            data-testid={`tournament-standing-withdrawn-${entry.entrantId}`}
                          >
                            Withdrawn
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                        {entry.wins}&ndash;{entry.losses}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{formatDifferential(entry.pointDifferential)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No standings yet." compact />
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
