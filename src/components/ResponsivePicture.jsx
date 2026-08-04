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
  if (!image) return null

  return (
    <picture>
      <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
      <source type="image/webp" srcSet={image.webpSrcSet} sizes={image.sizes} />
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
