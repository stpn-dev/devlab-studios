import { describe, it, expect, vi, afterEach } from 'vitest'
import { uploadPendingGalleryImages } from './projectImageUpload.js'

function makeFile(name) {
  return new File(['fake-bytes'], name, { type: 'image/webp' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadPendingGalleryImages', () => {
  it('passes through already-saved (non-pending) items unchanged', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: '1', url: 'https://example.com/a.webp', filename: 'a.webp', altText: '', sortOrder: 1, isThumbnail: false, pending: false, file: null }]
    const result = await uploadPendingGalleryImages(items)

    expect(result).toEqual(items)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads pending items and replaces url/filename with the server response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://example.com/real.webp', filename: 'real.webp' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: 'pending-1', url: 'blob:local-preview', filename: 'staged.webp', altText: 'Alt', sortOrder: 1, isThumbnail: true, pending: true, file: makeFile('staged.webp') }]
    const result = await uploadPendingGalleryImages(items)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/media', expect.objectContaining({ method: 'POST' }))
    expect(result).toEqual([{ id: 'pending-1', url: 'https://example.com/real.webp', filename: 'real.webp', altText: 'Alt', sortOrder: 1, isThumbnail: true, pending: false, file: null }])
  })

  it('throws with the file name when an upload fails, without uploading later items', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Too large' }) })
    vi.stubGlobal('fetch', fetchMock)

    const items = [{ id: 'pending-1', url: 'blob:local-preview', filename: 'staged.webp', altText: '', sortOrder: 1, isThumbnail: false, pending: true, file: makeFile('staged.webp') }]

    await expect(uploadPendingGalleryImages(items)).rejects.toThrow('staged.webp')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports progress via the onProgress callback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://example.com/real.webp', filename: 'real.webp' }) })
    vi.stubGlobal('fetch', fetchMock)
    const onProgress = vi.fn()

    const items = [{ id: 'pending-1', url: 'blob:local-preview', filename: 'staged.webp', altText: '', sortOrder: 1, isThumbnail: false, pending: true, file: makeFile('staged.webp') }]
    await uploadPendingGalleryImages(items, onProgress)

    expect(onProgress).toHaveBeenCalledWith('staged.webp')
  })
})
