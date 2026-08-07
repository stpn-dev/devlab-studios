import sharp from 'sharp'
import { mkdirSync } from 'fs'

const SOURCE = 'src/assets/devlabstudios-logo-only.png'
const BACKGROUND = '#121739' // brand.ink
const CANVAS_SIZE = 1024
const MARK_SCALE = 0.62 // fraction of canvas the logo mark occupies, leaving safe padding for icon masking

const OUTPUTS = [
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
]

mkdirSync('public', { recursive: true })

const markSize = Math.round(CANVAS_SIZE * MARK_SCALE)
const mark = await sharp(SOURCE).resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()

const canvas = sharp({
  create: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    channels: 4,
    background: BACKGROUND,
  },
}).composite([{ input: mark, gravity: 'center' }])

const master = await canvas.png().toBuffer()

for (const { file, size } of OUTPUTS) {
  await sharp(master).resize(size, size).png().toFile(file)
  console.log(`wrote ${file} (${size}x${size})`)
}
