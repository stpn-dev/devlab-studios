import clsx from 'clsx'
import AnimatedIcon from './icons/AnimatedIcon'
import { ArrowRight } from './icons/icons'

const styles = {
  base:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:ring-brand-teal disabled:cursor-not-allowed disabled:opacity-55',
  primary:
    'border border-brand-orange bg-[linear-gradient(135deg,#6800ff_0%,#4500ff_52%,#0000ff_100%)] text-white shadow-[0_10px_24px_rgba(69,0,255,0.24)] hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_30px_rgba(69,0,255,0.30)] active:translate-y-0 active:scale-[0.99]',
  secondary:
    'border border-[#cdd2ea] bg-white text-brand-ink shadow-sm hover:-translate-y-0.5 hover:border-brand-teal/40 hover:bg-[#f7f7ff] hover:text-brand-teal active:translate-y-0',
  ghost:
    'border border-[#cdd2ea] bg-transparent text-brand-ink hover:border-brand-teal/40 hover:bg-white hover:text-brand-teal',
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
