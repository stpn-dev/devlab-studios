// The bracket as a spectator sees it: pools first, then the winners bracket,
// then the losers bracket, each grouped by round.
//
// Read-only and name-only by design. It renders exactly the fields the public
// snapshot allowlists (publicSessionView.ts) -- pair display names, round,
// status, and who won -- and has no access to anything else, so it cannot
// leak an internal field by rendering one.

const BRACKET_TITLES = {
  POOL: 'Pools',
  MAIN: 'Bracket',
  LOSERS: 'Losers bracket',
}

// A slot with no name yet. `TBD` rather than a blank, because the whole
// bracket exists from the moment it is locked: a spectator looking at a final
// nobody has qualified for should see that the match is scheduled, not an
// empty box that reads as a rendering fault.
function EntrantName({ name, isWinner }) {
  if (!name) return <span className="text-slate-500">TBD</span>
  return <span className={isWinner ? 'font-semibold text-emerald-300' : 'text-slate-200'}>{name}</span>
}

function groupBy(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item)
    const bucket = groups.get(key) || []
    bucket.push(item)
    groups.set(key, bucket)
  }
  return groups
}

function FixtureRow({ fixture }) {
  const winnerIsA = fixture.winnerEntrantId && fixture.winnerEntrantId === fixture.entrantAId
  const winnerIsB = fixture.winnerEntrantId && fixture.winnerEntrantId === fixture.entrantBId
  // A finished fixture with no game is a walkover -- a real outcome a
  // spectator should be able to tell apart from a played result.
  const isWalkover = fixture.status === 'FINISHED' && !fixture.winnerEntrantId

  return (
    <li className="flex items-center justify-between gap-3 rounded-md bg-slate-900/40 px-3 py-2 text-sm">
      <span className="flex min-w-0 flex-col gap-0.5">
        <EntrantName name={fixture.entrantAName} isWinner={winnerIsA} />
        <EntrantName name={fixture.entrantBName} isWinner={winnerIsB} />
      </span>
      <span className="flex-shrink-0 text-xs uppercase tracking-wide text-slate-400">
        {isWalkover ? 'No result' : fixture.status.replace(/_/g, ' ').toLowerCase()}
      </span>
    </li>
  )
}

export default function PublicBracket({ bracket }) {
  if (!bracket || bracket.length === 0) return null

  const byBracket = groupBy(bracket, (fixture) => fixture.bracket)
  const order = ['POOL', 'MAIN', 'LOSERS'].filter((key) => byBracket.has(key))

  return (
    <div className="space-y-4" data-testid="live-bracket">
      {order.map((bracketKey) => {
        const fixtures = byBracket.get(bracketKey)
        // Pools are grouped by their label; brackets by round number.
        const sections =
          bracketKey === 'POOL'
            ? groupBy(fixtures, (fixture) => `Pool ${fixture.poolLabel}`)
            : groupBy(fixtures, (fixture) => `Round ${fixture.roundNumber}`)

        return (
          <div key={bracketKey} className="pb-scoreboard p-4">
            <p className="text-sm font-semibold text-white">{BRACKET_TITLES[bracketKey] ?? bracketKey}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {[...sections.entries()].map(([sectionName, sectionFixtures]) => (
                <div key={sectionName}>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{sectionName}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {sectionFixtures
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((fixture) => (
                        <FixtureRow key={fixture.id} fixture={fixture} />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
