import { describe, it, expect } from 'vitest'
import { normalizeGalleryImages, deriveThumbnailFields, diffRemovedGalleryUrls } from './projects.js'

describe('normalizeGalleryImages', () => {
  it('maps isThumbnail from input, defaulting to false', () => {
    const result = normalizeGalleryImages([
      { url: 'https://example.com/a.webp', isThumbnail: true },
      { url: 'https://example.com/b.webp' },
    ])
    expect(result[0].isThumbnail).toBe(true)
    expect(result[1].isThumbnail).toBe(false)
  })

  it('drops items with no url', () => {
    const result = normalizeGalleryImages([{ url: '' }, { url: 'https://example.com/a.webp' }])
    expect(result).toHaveLength(1)
  })
})

describe('deriveThumbnailFields', () => {
  it('returns the flagged row url/filename', () => {
    const result = deriveThumbnailFields([
      { url: 'https://example.com/a.webp', filename: 'a.webp', isThumbnail: false },
      { url: 'https://example.com/b.webp', filename: 'b.webp', isThumbnail: true },
    ])
    expect(result).toEqual({ imageUrl: 'https://example.com/b.webp', imageFilename: 'b.webp' })
  })

  it('returns empty strings when nothing is flagged', () => {
    const result = deriveThumbnailFields([{ url: 'https://example.com/a.webp', filename: 'a.webp', isThumbnail: false }])
    expect(result).toEqual({ imageUrl: '', imageFilename: '' })
  })

  it('returns empty strings for an empty gallery', () => {
    expect(deriveThumbnailFields([])).toEqual({ imageUrl: '', imageFilename: '' })
  })
})

describe('diffRemovedGalleryUrls', () => {
  it('returns urls present before but not after', () => {
    const result = diffRemovedGalleryUrls(
      ['https://example.com/a.webp', 'https://example.com/b.webp'],
      ['https://example.com/b.webp'],
    )
    expect(result).toEqual(['https://example.com/a.webp'])
  })

  it('returns an empty array when nothing was removed', () => {
    const result = diffRemovedGalleryUrls(['https://example.com/a.webp'], ['https://example.com/a.webp'])
    expect(result).toEqual([])
  })

  it('dedupes a URL that appears more than once in the previous list', () => {
    const result = diffRemovedGalleryUrls(
      ['https://example.com/a.webp', 'https://example.com/a.webp', 'https://example.com/b.webp'],
      ['https://example.com/b.webp'],
    )
    expect(result).toEqual(['https://example.com/a.webp'])
  })
})
