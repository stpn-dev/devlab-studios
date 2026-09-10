import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi, describeApiError } from '../lib/pickleballApi'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonRows } from '../components/SkeletonLoader'
import { Info } from '../../components/icons/icons'

// Same confidence-tier display copy/tone as PlayerProfilePage.jsx's
// ConfidenceTierChip -- duplicated locally rather than imported, since this
// task's declared file scope is these three page files only (no shared
// components/util file is in scope for Task 7); both copies stay small and
// derive from the same real `confidenceTier` enum (opi.ts), never inventing
// a new tier.
const CONFIDENCE_TIER_LABEL = { PROVISIONAL: 'Provisional', DEVELOPING: 'Developing', ESTABLISHED: 'Established' }
const CONFIDENCE_TIER_TONE = { PROVISIONAL: 'muted', DEVELOPING: 'info', ESTABLISHED: 'success' }

function ConfidenceTierChip({ tier }) {
  const tone = CONFIDENCE_TIER_TONE[tier] || 'muted'
  const label = CONFIDENCE_TIER_LABEL[tier] || tier
  return <span className={`pb-status-chip pb-status-chip--${tone}`}>{label}</span>
}

// OPI is already a 0-100 percentage (gamePerformance() in opi.ts) -- this
// only adds the missing "%" unit to the existing real value. A player with no
// eligible game yet has opi === null (never 0, which would read as "played
// and scored nothing"), so the board shows an em dash for them instead.
function formatOpi(opi) {
  if (opi === null || opi === undefined) return '—'
  return `${opi.toFixed(2)}%`
}

function formatDifferential(differential) {
  return differential > 0 ? `+${differential}` : `${differential}`
}

function differentialTone(differential) {
  if (differential > 0) return 'text-emerald-600'
  if (differential < 0) return 'text-rose-600'
  return 'text-slate-400'
}

function StandingsRow({ entry, highlight }) {
  return (
    <tr className={highlight ? 'bg-brand/5' : 'bg-white'}>
      <td
        className={`w-10 px-3 py-2.5 text-right align-middle tabular-nums ${
          highlight ? 'pb-score text-brand' : 'font-semibold text-slate-400'
        }`}
      >
        {entry.rank ?? '—'}
      </td>
      <td className="max-w-0 px-3 py-2.5 align-middle">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-slate-900">{entry.displayName}</span>
          {entry.onCourt ? <span className="pb-status-chip pb-status-chip--success whitespace-nowrap">On court</span> : null}
          {entry.availabilityStatus === 'TEMPORARILY_UNAVAILABLE' ? (
            <span className="pb-status-chip pb-status-chip--muted whitespace-nowrap">Away</span>
          ) : null}
          {entry.attendanceStatus === 'LEFT_SESSION' ? (
            <span className="pb-status-chip pb-status-chip--muted whitespace-nowrap">Left</span>
          ) : null}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right align-middle tabular-nums text-slate-600">{entry.eligibleGamesCount}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle tabular-nums text-slate-600">
        {entry.wins}&ndash;{entry.losses}
      </td>
      <td className={`px-3 py-2.5 text-right align-middle tabular-nums ${differentialTone(entry.pointDifferential)}`}>
        {formatDifferential(entry.pointDifferential)}
      </td>
      <td className="px-3 py-2.5 text-right align-middle">
        <span className="pb-score text-lg text-slate-900">{formatOpi(entry.opi)}</span>
      </td>
      <td className="hidden px-3 py-2.5 text-right align-middle sm:table-cell">
        <ConfidenceTierChip tier={entry.confidenceTier} />
      </td>
    </tr>
  )
}

export default function LeaderboardPage() {
  const { sessionId } = useOutletContext()
  const [rows, setRows] = useState(null)
  const [minGames, setMinGames] = useState(null)
  // Defaults ON: the whole point of session standings is that the board is
  // populated and ranked from the first minute of a session, when by
  // definition nobody has met the min-games threshold yet. Unchecking it
  // narrows the view to qualified players only.
  const [showAll, setShowAll] = useState(true)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  // Render-phase reset (React's own "adjusting state when a prop changes"
  // pattern) rather than a setState inside the effect body: switching
  // sessions must clear the previous session's rows in the same render, so
  // the board never shows one session's standings under another's heading.
  if (fetchKey !== sessionId) {
    setFetchKey(sessionId)
    setRows(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    // No minGames param: the session's own configured threshold decides who
    // is *ranked*. Provisional players come back regardless now, so the
    // toggle below is pure client-side filtering -- no refetch, no flicker.
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}/leaderboard`)
      .then((data) => {
        if (ignore) return
        setRows(data.leaderboard)
        setMinGames(data.minGames ?? null)
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: describeApiError(error) })
      })
    return () => {
      ignore = true
    }
  }, [sessionId])

  const threshold = minGames ?? 3
  const gamesWord = threshold === 1 ? 'game' : 'games'
  const qualified = rows ? rows.filter((entry) => entry.qualified) : []
  const provisional = rows ? rows.filter((entry) => !entry.qualified) : []
  const visible = showAll ? [...qualified, ...provisional] : qualified

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Standings</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            Every checked-in player, ranked. OPI counts finished games only, so it fills in as games complete.
          </p>
          {/* The "[ ? How OPI works ]" tooltip trigger (Step 3): a real link
              to the existing /pickleball/methodology page whose hover/focus
              state also surfaces the non-endorsement disclaimer inline,
              matching PlayerProfilePage.jsx's identical treatment. */}
          <a
            href="/pickleball/methodology"
            className="group relative mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            How OPI works
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-72 -translate-y-1 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed text-slate-600 opacity-0 shadow-md transition-all duration-150 motion-reduce:transition-none group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
            >
              OPI is a Devlab-original performance metric, not an official USA Pickleball rating, DUPR, UTR-P, or skill certification. Tap to read the full methodology.
            </span>
          </a>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Show provisional players
        </label>
      </div>
      {message ? <p className="text-sm text-rose-600">{message.text}</p> : null}
      {rows === null && !message ? (
        <SkeletonBlock>
          <SkeletonRows rows={5} />
        </SkeletonBlock>
      ) : null}
      {rows && !visible.length ? (
        <EmptyState
          title={rows.length ? 'No qualifying players yet.' : 'Nobody has checked in yet.'}
          description={
            rows.length
              ? `Players are ranked once they have ${threshold} eligible ${gamesWord}. Tick "Show provisional players" to see everyone now.`
              : 'Check players in on the Check-in page and they appear here straight away.'
          }
        />
      ) : null}
      {rows && visible.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm" data-testid="leaderboard-list">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  #
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Player
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Games
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  W&ndash;L
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold" title="Points for minus points against">
                  Diff
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  OPI
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-semibold sm:table-cell">
                  Tier
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {qualified.map((entry) => (
                <StandingsRow key={entry.playerId} entry={entry} highlight={entry.rank <= 3} />
              ))}
              {showAll && provisional.length ? (
                <tr>
                  <td
                    colSpan={7}
                    className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    Not yet ranked &middot; needs {threshold} eligible {gamesWord}
                  </td>
                </tr>
              ) : null}
              {showAll ? provisional.map((entry) => <StandingsRow key={entry.playerId} entry={entry} highlight={false} />) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
