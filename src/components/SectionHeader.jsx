import clsx from 'clsx'

function SectionHeader({ title, subtitle, align = 'left' }) {
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left'

  return (
    <div className={clsx('flex flex-col gap-2', alignment)}>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-teal">Overview</p>
      <div>
        <h2 className="text-3xl font-semibold text-brand-ink sm:text-4xl">{title}</h2>
        {subtitle ? <p className="mt-2 text-lg text-slate-600">{subtitle}</p> : null}
      </div>
    </div>
  )
}

export default SectionHeader
