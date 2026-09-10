const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024
const MIN_IMAGE_WIDTH = 320
const MIN_IMAGE_HEIGHT = 180
// 2560 rather than 1920: the browser is the worst place in this pipeline to
// resize, and anything above the 1920 lightbox box gets resized again by
// Cloudflare Images (which resamples far better than a 2D canvas). Keeping
// more detail in the stored original therefore costs some R2 bytes but
// visibly improves every derivative. MAX_IMAGE_UPLOAD_BYTES still caps it.
const MAX_IMAGE_WIDTH = 2560
const MAX_IMAGE_HEIGHT = 2560
// 0.92, not 0.84. These uploads are overwhelmingly UI screenshots — dense
// small text and hard edges, which is exactly what WebP's lossy mode smears
// first. The extra bytes are reclaimed downstream by the AVIF/WebP
// derivatives that are what visitors actually download.
const WEBP_QUALITY = 0.92

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])

function fileBaseName(filename) {
  return String(filename || 'upload')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'upload'
}

/**
 * True only for bytes that really are WebP (`RIFF....WEBP`), mirroring the
 * server's own signature check in src/pages/api/admin/media.ts. A File's
 * `type` is inferred from its extension, so a PNG renamed to .webp claims
 * `image/webp` — that must not be allowed to skip re-encoding, or the server
 * would reject the upload as malformed.
 */
async function isRealWebp(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (header.length < 12) return false
  const ascii = String.fromCharCode(...header)
  return ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP'
}

/**
 * Decodes and (if needed) downscales in one step via createImageBitmap's
 * own `resizeQuality: 'high'` resampler, which is a proper multi-tap filter.
 * Returns null when the browser lacks createImageBitmap or its resize
 * options, so the caller can fall back to the canvas path.
 */
async function decodeAndResize(file, targetWidth, targetHeight) {
  if (typeof createImageBitmap !== 'function') return null

  try {
    const source = await createImageBitmap(file)
    if (source.width === targetWidth && source.height === targetHeight) return source

    const resized = await createImageBitmap(source, {
      resizeWidth: targetWidth,
      resizeHeight: targetHeight,
      resizeQuality: 'high',
    })
    source.close()
    return resized
  } catch {
    return null
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const image = new Image()

    image.onload = () => {
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }

    image.onerror = () => {
      reject(new Error('The selected file is not a readable image.'))
    }

    reader.onerror = () => {
      reject(new Error('The selected image could not be read.'))
    }

    reader.onload = () => {
      image.src = String(reader.result || '')
    }

    reader.readAsDataURL(file)
  })
}

function blobToFile(blob, filename) {
  return new File([blob], filename, {
    type: 'image/webp',
    lastModified: Date.now(),
  })
}

function canvasToWebP(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image conversion failed.'))
          return
        }

        resolve(blob)
      },
      'image/webp',
      quality,
    )
  })
}

export async function validateAndConvertToWebP(file, {
  maxWidth = MAX_IMAGE_WIDTH,
  maxHeight = MAX_IMAGE_HEIGHT,
  minWidth = MIN_IMAGE_WIDTH,
  minHeight = MIN_IMAGE_HEIGHT,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES,
  quality = WEBP_QUALITY,
} = {}) {
  if (!(file instanceof File)) {
    throw new Error('A valid image file is required.')
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Only JPG, PNG, WebP, and AVIF images are allowed.')
  }

  if (file.size <= 0) {
    throw new Error('The selected image is empty.')
  }

  if (file.size > maxBytes) {
    throw new Error('The selected image exceeds the 12 MB upload limit.')
  }

  const { image, width, height } = await loadImage(file)

  if (width < minWidth || height < minHeight) {
    throw new Error(`Images must be at least ${minWidth}x${minHeight}px.`)
  }

  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const filename = `${fileBaseName(file.name)}.webp`

  // A WebP that already fits the caps needs no work at all. Re-encoding one
  // is pure generation loss — lossy WebP decoded and re-encoded is strictly
  // worse than the bytes we were handed, with no upside. This is the path a
  // "replace" takes when re-uploading an image the CMS produced earlier,
  // which is why replacements used to degrade a little every round trip.
  if (file.type === 'image/webp' && scale === 1 && await isRealWebp(file)) {
    const passthrough = blobToFile(file, filename)
    return {
      file: passthrough,
      original: { width, height, size: file.size, type: file.type },
      converted: { width, height, size: passthrough.size, type: passthrough.type },
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is unavailable in this browser session.')
  }

  const bitmap = await decodeAndResize(file, targetWidth, targetHeight)

  if (bitmap) {
    // Already resampled at high quality by createImageBitmap — blit 1:1.
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
  } else {
    // Canvas fallback. Both lines matter: the default imageSmoothingQuality
    // is 'low', a cheap near-nearest-neighbour filter whose aliasing on
    // downscaled screenshots is exactly the "pixelated" artefact reported.
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, targetWidth, targetHeight)
  }

  const webpBlob = await canvasToWebP(canvas, quality)
  const webpFile = blobToFile(webpBlob, filename)

  return {
    file: webpFile,
    original: {
      width,
      height,
      size: file.size,
      type: file.type,
    },
    converted: {
      width: targetWidth,
      height: targetHeight,
      size: webpFile.size,
      type: webpFile.type,
    },
  }
}
