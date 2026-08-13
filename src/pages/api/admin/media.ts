import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/env'
import { recordMediaAsset, listMediaAssets } from '../../../worker/repositories/mediaAssets.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function nowIso(): string {
  return new Date().toISOString()
}

function inferContentType(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    avif: 'image/avif', gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg',
    png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp',
  }
  return extension ? types[extension] || 'application/octet-stream' : 'application/octet-stream'
}

function filenameFromKey(key: string): string {
  const filename = key.split('/').pop() || key
  try { return decodeURIComponent(filename) } catch { return filename }
}

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv()
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 MEDIA_BUCKET binding is not configured.' }, 503)

  const prefix = String(url.searchParams.get('prefix') || '').replace(/^\/+/, '')
  const cursor = url.searchParams.get('cursor') || undefined
  const requestedLimit = Number(url.searchParams.get('limit')) || 250
  const limit = Math.min(Math.max(requestedLimit, 1), 500)
  const publicBaseUrl = String(env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const listed = await env.MEDIA_BUCKET.list({
    prefix: prefix || undefined,
    cursor,
    limit,
    include: ['httpMetadata', 'customMetadata'],
  })

  const trackedAssets = env.DB ? await listMediaAssets(env.DB, { limit: 1000 }).catch(() => []) : []
  const trackedByKey = new Map(trackedAssets.map((asset) => [asset.key, asset]))
  const assets = listed.objects.map((object) => {
    const tracked = trackedByKey.get(object.key)
    const contentType = String(object.httpMetadata?.contentType || tracked?.contentType || inferContentType(object.key))
    const folder = object.key.includes('/') ? object.key.slice(0, object.key.lastIndexOf('/')) : 'root'
    return {
      id: tracked?.id || object.key,
      key: object.key,
      url: publicBaseUrl ? `${publicBaseUrl}/${object.key.split('/').map(encodeURIComponent).join('/')}` : tracked?.url || '',
      filename: tracked?.filename || filenameFromKey(object.key),
      contentType,
      size: object.size,
      altText: tracked?.altText || '',
      folder,
      uploadedAt: object.uploaded.toISOString(),
      etag: object.httpEtag,
      trackedInD1: Boolean(tracked),
    }
  })

  return jsonResponse({
    assets,
    summary: {
      objectCount: assets.length,
      totalBytes: assets.reduce((total, asset) => total + asset.size, 0),
      trackedCount: assets.filter((asset) => asset.trackedInD1).length,
      imageCount: assets.filter((asset) => asset.contentType.startsWith('image/')).length,
      prefix,
      isComplete: !listed.truncated,
    },
    cursor: listed.truncated ? listed.cursor : null,
  })
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  if (!env.MEDIA_BUCKET) return jsonResponse({ error: 'R2 MEDIA_BUCKET binding is not configured.' }, 503)
  if (!String(env.R2_PUBLIC_BASE_URL || '').trim()) {
    return jsonResponse({ error: 'R2_PUBLIC_BASE_URL is not configured.' }, 503)
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const folder = String(formData.get('folder') || 'uploads').replace(/[^a-z0-9/_-]/gi, '')

  if (!file || typeof file === 'string') return jsonResponse({ error: 'A file upload is required.' }, 400)
  if (!String(file.type || '').startsWith('image/')) {
    return jsonResponse({ error: 'Only image uploads are allowed.' }, 400)
  }
  if (file.size <= 0) {
    return jsonResponse({ error: 'Uploaded image is empty.' }, 400)
  }
  if (folder === 'projects' && file.type !== 'image/webp') {
    return jsonResponse({ error: 'Project images must be uploaded as WebP.' }, 400)
  }

  const key = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9._-]/gi, '-')}`
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { uploadedAt: nowIso() },
  })

  const publicBaseUrl = env.R2_PUBLIC_BASE_URL || ''
  const url = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : key

  if (env.DB) {
    try {
      await recordMediaAsset(env.DB, { key, url, filename: file.name, contentType: file.type, size: file.size, folder })
    } catch {
      // The R2 object is already stored — a metadata-tracking failure shouldn't fail the upload itself.
    }
  }

  return jsonResponse({
    key,
    filename: file.name,
    contentType: file.type,
    size: file.size,
    url,
  }, 201)
}
