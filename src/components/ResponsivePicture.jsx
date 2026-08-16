import { brandingAssets } from '../config/branding.js'
import devlabStudiosLogo from '../assets/devlabstudios-logo-only.png'

/**
 * @param {{
 *   image: import('../lib/images/optimizeImage').OptimizedPicture | null,
 *   alt: string,
 *   className?: string,
 *   loading?: 'lazy' | 'eager',
 *   onClick?: () => void,
 * }} props
 */
function ResponsivePicture({ image, alt, className, loading = 'lazy', onClick }) {
  if (!image) {
    return (
      <img
        src={brandingAssets.logoOnlyUrl}
        data-fallback-src={devlabStudiosLogo.src}
        alt={alt}
        className={className}
        loading="lazy"
        onError={(event) => {
          const target = event.currentTarget
          if (target.dataset.fallbackSrc && target.src !== target.dataset.fallbackSrc) {
            target.src = target.dataset.fallbackSrc
          }
        }}
      />
    )
  }

  return (
    <picture className="block">
      <source type="image/avif" srcSet={image.avifSrcSet} />
      <source type="image/webp" srcSet={image.webpSrcSet} />
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={alt}
        className={className}
        loading={loading}
        onClick={onClick}
      />
    </picture>
  )
}

export default ResponsivePicture
