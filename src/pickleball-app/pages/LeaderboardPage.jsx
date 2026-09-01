import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'
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
// only adds the missing "%" unit to the existing real value.
function formatOpi(opi) {
  return `${opi.toFixed(2)}%`
}

export default function LeaderboardPage() {
  const { sessionId } = useOutletContext()
  const [rows, setRows] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  const currentKey = `${sessionId}:${showAll}`
  if (fetchKey !== currentKey) {
    setFetchKey(currentKey)
    setRows(null)
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    const query = showAll ? '?minGames=0' : ''
    pickleballApi
      .get(`/api/pickleball/sessions/${sessionId}/leaderboard${query}`)
      .then((data) => {
        if (!ignore) setRows(data.leaderboard)
      })
      .catch((error) => {
        if (!ignore) setMessage({ type: 'error', text: error.message })
      })
    return () => {
      ignore = true
    }
  }, [sessionId, showAll])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Leaderboard</h1>
          <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
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
      {rows === null && !message ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {rows && !rows.length ? <p className="text-sm text-slate-500">No qualifying players yet.</p> : null}
      {rows && rows.length ? (
        <div className="space-y-2" data-testid="leaderboard-list">
          {rows.map((row, index) => {
            const isTopThree = index < 3
            return (
              <div
                key={row.playerId}
                className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm ${
                  isTopThree ? 'border-brand/20 bg-brand/5' : 'border-slate-200 bg-white'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`w-6 flex-shrink-0 text-right ${isTopThree ? 'pb-score text-brand' : 'font-semibold text-slate-400'}`}>
                    {index + 1}
                  </span>
                  <span className="truncate font-semibold text-slate-900">{row.displayName}</span>
                  <ConfidenceTierChip tier={row.confidenceTier} />
                </span>
                <span className="flex flex-shrink-0 items-center gap-3 text-slate-600">
                  <span>{row.eligibleGamesCount} games</span>
                  <span className="pb-score text-lg text-slate-900">{formatOpi(row.opi)}</span>
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
