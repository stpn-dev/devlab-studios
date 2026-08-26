import { useState } from 'react'

export default function CorrectionPanel({ game, onReopen, onCorrect }) {
  const [scoreA, setScoreA] = useState(String(game.scoreA))
  const [scoreB, setScoreB] = useState(String(game.scoreB))
  const [servingTeam, setServingTeam] = useState(game.servingTeam)
  const [serverNumber, setServerNumber] = useState(String(game.serverNumber))

  function handleSubmit(event) {
    event.preventDefault()
    onCorrect({
      scoreA: Number(scoreA),
      scoreB: Number(scoreB),
      servingTeam,
      serverNumber: Number(serverNumber),
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="correction-panel">
      <p className="text-sm font-semibold text-amber-900">Correction panel</p>

      {game.status === 'FINISHED' ? (
        <button
          type="button"
          onClick={onReopen}
          className="rounded border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          Reopen game
        </button>
      ) : null}

      {game.status === 'IN_PROGRESS' ? (
        <form className="space-y-2" onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-amber-900">Score A</span>
              <input
                type="number"
                min="0"
                value={scoreA}
                onChange={(event) => setScoreA(event.target.value)}
                data-testid="correction-score-a"
                className="w-20 rounded border border-amber-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-amber-900">Score B</span>
              <input
                type="number"
                min="0"
                value={scoreB}
                onChange={(event) => setScoreB(event.target.value)}
                data-testid="correction-score-b"
                className="w-20 rounded border border-amber-300 px-2 py-1 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-amber-900">Serving team</span>
            <select value={servingTeam} onChange={(event) => setServingTeam(event.target.value)} className="rounded border border-amber-300 px-2 py-1 text-sm">
              <option value="A">Team A</option>
              <option value="B">Team B</option>
            </select>
          </label>
          {game.format === 'DOUBLES' ? (
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-amber-900">Server number</span>
              <select value={serverNumber} onChange={(event) => setServerNumber(event.target.value)} className="rounded border border-amber-300 px-2 py-1 text-sm">
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          ) : null}
          <button type="submit" className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
            Save correction
          </button>
        </form>
      ) : null}
    </div>
  )
}
