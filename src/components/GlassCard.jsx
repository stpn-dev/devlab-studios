import clsx from 'clsx'

function GlassCard({ children, className }) {
  return (
    <div
      className={clsx(
        'glass-surface rounded-2xl border border-white/15 bg-slate-950/70 backdrop-blur-xl shadow-glass',
        'transition duration-300 hover:-translate-y-0.5 hover:border-brand-teal/35 hover:shadow-2xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

export default GlassCard
