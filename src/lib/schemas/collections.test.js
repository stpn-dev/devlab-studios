import { describe, it, expect } from 'vitest'
import { projectRequestSchema } from './collections'

const basePayload = {
  id: 'demo-project',
  title: 'Demo Project',
  description: 'A demo project.',
  type: 'Automation',
}

describe('projectRequestSchema — gallery thumbnail flag', () => {
  it('defaults isThumbnail to false when omitted', () => {
    const result = projectRequestSchema.safeParse({
      ...basePayload,
      galleryImages: [{ url: 'https://example.com/a.webp' }],
    })
    expect(result.success).toBe(true)
    expect(result.data.galleryImages[0].isThumbnail).toBe(false)
  })

  it('accepts exactly one isThumbnail: true', () => {
    const result = projectRequestSchema.safeParse({
      ...basePayload,
      galleryImages: [
        { url: 'https://example.com/a.webp', isThumbnail: true },
        { url: 'https://example.com/b.webp', isThumbnail: false },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects more than one isThumbnail: true', () => {
    const result = projectRequestSchema.safeParse({
      ...basePayload,
      galleryImages: [
        { url: 'https://example.com/a.webp', isThumbnail: true },
        { url: 'https://example.com/b.webp', isThumbnail: true },
      ],
    })
    expect(result.success).toBe(false)
  })
})
