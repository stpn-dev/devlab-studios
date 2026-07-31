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

/**
 * `to` renders a plain internal `<a>`, not react-router's `<Link>` — this
 * component is used both inside the legacy wrapped React app and in
 * server-rendered Astro pages with no Router context, and since pages are
 * incrementally moving from react-router routes to real Astro pages,
 * client-side SPA navigation between them isn't reliable anyway. `href` is
 * for genuinely external links (opens in a new tab).
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.to]
 * @param {string} [props.href]
 * @param {'primary' | 'secondary' | 'ghost'} [props.variant]
 * @param {string} [props.className]
 * @param {boolean} [props.showIcon]
 */
function PrimaryButton({
  children,
  to,
  href,
  variant = 'primary',
  className,
  showIcon = false,
  ...props
}) {
  const Element = href ? 'a' : to ? 'a' : 'button'
  const elementProps = href ? { href, target: '_blank', rel: 'noreferrer' } : to ? { href: to } : {}

  return (
    <Element className={clsx(styles.base, styles[variant], className)} {...elementProps} {...props}>
      {children}
      {showIcon && <AnimatedIcon icon={ArrowRight} size={16} animationType="hover-slide" />}
    </Element>
  )
}

export default PrimaryButton
