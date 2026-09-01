const BANNER_COPY = {
  SIDE_OUT: { text: 'Side out', className: 'bg-amber-100 text-amber-800' },
  GAME_POINT: { text: 'Game point', className: 'bg-rose-100 text-rose-800' },
  TIED_WIN_BY_TWO: { text: 'Tied — win by two', className: 'bg-sky-100 text-sky-800' },
}

export default function ContextualBanner({ value }) {
  if (!value) return null
  const copy = BANNER_COPY[value]
  return (
    <p
      data-testid="contextual-banner"
      className={`inline-block rounded-full px-3.5 py-1 text-sm font-bold uppercase tracking-wide shadow-sm ${copy.className}`}
    >
      {copy.text}
    </p>
  )
}
