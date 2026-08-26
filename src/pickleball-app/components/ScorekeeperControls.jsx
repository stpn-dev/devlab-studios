export default function ScorekeeperControls({ onRally, onUndo, onFinish, isGameWon, canScore }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {canScore ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isGameWon}
              onClick={() => onRally('A')}
              className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
            >
              TEAM A WON RALLY
            </button>
            <button
              type="button"
              disabled={isGameWon}
              onClick={() => onRally('B')}
              className="rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
            >
              TEAM B WON RALLY
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onUndo}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              UNDO LAST RALLY
            </button>
            {isGameWon ? (
              <button
                type="button"
                onClick={onFinish}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Finish game
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-700">This game is under correction. Rallies are paused until it's finished again.</p>
          {isGameWon ? (
            <button
              type="button"
              onClick={onFinish}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Finish game
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}
