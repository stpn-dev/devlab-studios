const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024
const MIN_IMAGE_WIDTH = 320
const MIN_IMAGE_HEIGHT = 180
const MAX_IMAGE_WIDTH = 1920
const MAX_IMAGE_HEIGHT = 1920
const WEBP_QUALITY = 0.84

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

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is unavailable in this browser session.')
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  const webpBlob = await canvasToWebP(canvas, quality)
  const webpFile = blobToFile(webpBlob, `${fileBaseName(file.name)}.webp`)

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
