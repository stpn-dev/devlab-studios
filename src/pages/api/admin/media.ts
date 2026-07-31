import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/env'
import { recordMediaAsset, listMediaAssets } from '../../../worker/repositories/mediaAssets.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function nowIso(): string {
  return new Date().toISOString()
}

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const folder = url.searchParams.get('folder') || null
  const limit = Number(url.searchParams.get('limit')) || 100
  const assets = await listMediaAssets(env.DB, { folder, limit })
  return jsonResponse(assets)
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
