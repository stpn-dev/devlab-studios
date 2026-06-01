import { Link } from 'react-router-dom'
import clsx from 'clsx'
import AnimatedIcon from './icons/AnimatedIcon'
import { ArrowRight } from './icons/icons'

const styles = {
  base:
    'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:ring-brand-orange disabled:cursor-not-allowed disabled:opacity-60',
  primary:
    'border border-brand-orange bg-brand-orange text-white shadow-lg shadow-indigo-700/30 hover:bg-brand-orangeDark hover:border-brand-orangeDark active:scale-[0.99]',
  secondary:
    'border border-slate-300 bg-white text-brand-ink hover:border-brand-teal/50 hover:text-brand-teal hover:bg-slate-50',
  ghost:
    'border border-slate-300 bg-transparent text-brand-ink hover:border-brand-teal/50 hover:text-brand-teal hover:bg-white/70',
}

function PrimaryButton({
  children,
  to,
  href,
  variant = 'primary',
  className,
  showIcon = false,
  ...props
}) {
  const Element = href ? 'a' : to ? Link : 'button'
  const elementProps = href ? { href, target: '_blank', rel: 'noreferrer' } : to ? { to } : {}

  return (
    <Element className={clsx(styles.base, styles[variant], className)} {...elementProps} {...props}>
      {children}
      {showIcon && <AnimatedIcon icon={ArrowRight} size={16} animationType="hover-slide" />}
    </Element>
  )
}

export default PrimaryButton
