import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
import EmptyState from '../components/EmptyState'
import { SkeletonBlock, SkeletonLine, SkeletonRows } from '../components/SkeletonLoader'
import { Info } from '../../components/icons/icons'

// Confidence-tier display copy + tone, matching /pickleball/methodology's own
// Title Case copy ("Provisional"/"Developing"/"Established") rather than the
// raw uppercase enum the stats API returns (confidenceTier() in opi.ts).
// Tone follows the same --pb-status-* scale PlayerStatusChip already uses
// (muted -> info -> success as a player's sample size grows), reusing the
// existing `.pb-status-chip` classes from pickleball.css so no new CSS is
// needed for this task's declared file scope.
const CONFIDENCE_TIER_LABEL = { PROVISIONAL: 'Provisional', DEVELOPING: 'Developing', ESTABLISHED: 'Established' }
const CONFIDENCE_TIER_TONE = { PROVISIONAL: 'muted', DEVELOPING: 'info', ESTABLISHED: 'success' }

function ConfidenceTierChip({ tier }) {
  const tone = CONFIDENCE_TIER_TONE[tier] || 'muted'
  const label = CONFIDENCE_TIER_LABEL[tier] || tier
  return <span className={`pb-status-chip pb-status-chip--${tone}`}>{label}</span>
}

// OPI is already a 0-100 percentage (gamePerformance() in opi.ts: points
// scored / total points played * 100) -- this only adds the missing "%"
// unit to the existing real value, it does not compute or fetch anything
// new.
function formatOpi(opi) {
  return `${opi.toFixed(2)}%`
}

export default function PlayerProfilePage() {
  const { playerId } = useParams()
  const [player, setPlayer] = useState(null)
  const [stats, setStats] = useState(null)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = playerId
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setPlayer(null)
    setStats(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    Promise.all([
      pickleballApi.get(`/api/pickleball/players/${playerId}`),
      pickleballApi.get(`/api/pickleball/players/${playerId}/stats`),
    ])
      .then(([playerData, statsData]) => {
        if (!ignore) {
          setPlayer(playerData.player)
          setStats(statsData)
        }
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [playerId])

  if (message) return <p className="text-sm text-rose-600">{message.text}</p>
  if (!stats || !player) {
    return (
      <div className="space-y-6">
        <SkeletonBlock>
          <SkeletonLine className="h-7 w-56" />
          <div className="mt-4 space-y-3">
            <SkeletonLine className="h-24 w-full rounded-xl" />
            <SkeletonRows rows={3} />
          </div>
        </SkeletonBlock>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{player.displayName}</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
        {/* The "[ ? How OPI works ]" tooltip trigger (task Step 2): a real
            link to the existing /pickleball/methodology page (so it works
            with no JS/hover at all), whose hover/focus state also reveals
            the non-endorsement disclaimer inline -- copy matches
            methodology.astro's own established framing verbatim rather than
            inventing new wording. */}
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
      <div className="pb-scoreboard p-6" data-testid="player-all-time">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">All-time OPI</p>
        {stats.allTime ? (
          <>
            <p className="pb-score text-4xl text-white">{formatOpi(stats.allTime.opi)}</p>
            <p className="mt-1 text-xs text-slate-400">Share of points won across eligible games</p>
            {/* Games/wins/losses breakdown and a per-game recent-form sequence
                aren't in this page's fetch (players/[id]/stats.ts only
                returns opi/eligibleGamesCount/confidenceTier per scope, no
                win/loss counts) -- shown below is only what's real, per this
                task's no-fabrication constraint. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ConfidenceTierChip tier={stats.allTime.confidenceTier} />
              <span className="text-sm text-slate-300">{stats.allTime.eligibleGamesCount} eligible games</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-300">No eligible games yet.</p>
        )}
      </div>
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">By session</h2>
        <div className="space-y-2" data-testid="player-sessions">
          {stats.sessions.map((row) => (
            <div key={row.sessionId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold text-slate-900">{row.sessionName}</span>
                <ConfidenceTierChip tier={row.confidenceTier} />
              </span>
              <span className="flex flex-shrink-0 items-center gap-2 text-slate-600">
                <span>{row.eligibleGamesCount} games</span>
                <span className="pb-score">{formatOpi(row.opi)}</span>
              </span>
            </div>
          ))}
          {!stats.sessions.length ? <EmptyState title="No sessions yet." compact /> : null}
        </div>
      </div>
    </div>
  )
}
