import clsx from 'clsx'

/**
 * @param {object} props
 * @param {import('react').ComponentType<any>} props.icon
 * @param {number} [props.size]
 * @param {string} [props.color]
 * @param {'hover-scale' | 'hover-rotate' | 'hover-slide' | 'pulse' | 'bounce' | 'float' | 'spin' | 'none'} [props.animationType]
 * @param {boolean} [props.respectMotion]
 * @param {string} [props.className]
 * @param {string | null} [props.ariaLabel]
 */
function AnimatedIcon({
  icon,
  size = 20,
  color = 'text-current',
  animationType = 'none',
  respectMotion = true,
  className = '',
  ariaLabel = '',
}) {
  const IconComponent = icon
  if (!IconComponent) return null
  const animationClasses = clsx(
    {
      'group-hover:scale-110 transition-transform duration-300': animationType === 'hover-scale',
      'group-hover:rotate-12 transition-transform duration-300': animationType === 'hover-rotate',
      'group-hover:translate-x-1 transition-transform duration-300': animationType === 'hover-slide',
      'animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)] opacity-75':
        animationType === 'pulse' && !respectMotion,
      'animate-[bounce_2s_ease-in-out] motion-reduce:animate-none':
        animationType === 'bounce' && respectMotion,
      'animate-[bounce_2s_ease-in-out]': animationType === 'bounce' && !respectMotion,
      'animate-[float_3s_ease-in-out_infinite] motion-reduce:animate-none':
        animationType === 'float' && respectMotion,
      'animate-[float_3s_ease-in-out_infinite]': animationType === 'float' && !respectMotion,
      'animate-[rotate-smooth_1s_linear_infinite] motion-reduce:animate-none':
        animationType === 'spin' && respectMotion,
      'animate-[rotate-smooth_1s_linear_infinite]': animationType === 'spin' && !respectMotion,
    },
    color,
    className,
  )

  return (
    <IconComponent
      size={size}
      className={animationClasses}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
      strokeWidth={1.5}
    />
  )
}

export default AnimatedIcon
