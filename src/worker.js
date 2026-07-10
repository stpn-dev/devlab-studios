import { Hono } from 'hono'
import {
  getProfileContent,
  getResourcesContent,
  getSeoContent,
  getSeoMetadata,
  getServicesContent,
  getSiteSettingsContent,
  replaceProfileContent,
  replaceResourcesContent,
  replaceSeoContent,
  replaceServicesContent,
  replaceSiteSettingsContent,
} from './worker/repositories/content'
import { deleteProject, getProject, listProjects, upsertProject } from './worker/repositories/projects'
import { handleAdminLogin, handleAdminLogout, requireAdmin } from './worker/middleware/adminAuth'
import { jsonResponse, nowIso } from './worker/utils/responses'

const app = new Hono()
const CONTACT_WINDOW_MS = 10 * 60 * 1000
const CONTACT_MAX_ATTEMPTS = 5
const PUBLIC_CONTENT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
}
const contactAttempts = new Map()

app.use('*', async (c, next) => {
  const url = new URL(c.req.url)
  const forwardedProto = c.req.header('x-forwarded-proto')
  const shouldUseWww = url.hostname === 'devlabstudios.com'
  const shouldUseHttps = url.hostname.endsWith('devlabstudios.com') && (url.protocol === 'http:' || forwardedProto === 'http')

  if (shouldUseWww || shouldUseHttps) {
    url.hostname = 'www.devlabstudios.com'
    url.protocol = 'https:'
    return Response.redirect(url.toString(), 301)
  }

  return next()
})

function hasDb(env) {
  return Boolean(env.DB)
}

function hasMediaBucket(env) {
  return Boolean(env.MEDIA_BUCKET)
}

function publicJson(body) {
  return jsonResponse(body, 200, PUBLIC_CONTENT_CACHE_HEADERS)
}

function normalizeMediaUrl(url, env) {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value

  const publicBaseUrl = String(env.R2_PUBLIC_BASE_URL || '').trim()
  if (!publicBaseUrl) return value

  return `${publicBaseUrl.replace(/\/$/, '')}/${value.replace(/^\/+/, '')}`
}

function normalizeProjectMedia(project, env) {
  if (!project) return project

  return {
    ...project,
    imageUrl: normalizeMediaUrl(project.imageUrl, env),
    galleryImages: Array.isArray(project.galleryImages)
      ? project.galleryImages.map((image) => ({
          ...image,
          url: normalizeMediaUrl(image.url, env),
        }))
      : [],
  }
}

function getClientIp(c) {
  return c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
}

function isContactRateLimited(c) {
  const key = getClientIp(c)
  const now = Date.now()
  const attempt = contactAttempts.get(key)

  if (!attempt || now >= attempt.resetAt) {
    contactAttempts.set(key, { count: 1, resetAt: now + CONTACT_WINDOW_MS })
    return false
  }

  attempt.count += 1
  return attempt.count > CONTACT_MAX_ATTEMPTS
}

function validateContactPayload(payload) {
  const limits = {
    name: 120,
    email: 254,
    subject: 180,
    message: 5000,
  }
  const required = Object.keys(limits)
  const missing = required.filter((key) => !String(payload[key] || '').trim())
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`
  }

  const oversized = required.filter((key) => String(payload[key] || '').length > limits[key])
  if (oversized.length > 0) {
    return `Fields exceed maximum length: ${oversized.join(', ')}`
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email || '').trim())) {
    return 'Email address is invalid.'
  }

  return null
}

async function handleContact(c) {
  const webhookUrl = c.env.ZOHO_WEBHOOK_URL
  if (!webhookUrl) {
    return jsonResponse({ error: 'Server misconfiguration: ZOHO_WEBHOOK_URL missing.' }, 500)
  }

  if (isContactRateLimited(c)) {
    return jsonResponse({ error: 'Too many contact submissions. Try again later.' }, 429)
  }

  let payload
  try {
    payload = await c.req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }

  const validationError = validateContactPayload(payload)
  if (validationError) {
    return jsonResponse({ error: validationError }, 400)
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!upstream.ok) {
      return jsonResponse({ error: `Zoho upstream error: ${upstream.status}` }, 502)
    }

    return jsonResponse({ ok: true })
  } catch {
    return jsonResponse({ error: 'Unable to reach Zoho endpoint.' }, 502)
  }
}

app.get('/api/health', (c) => c.json({
  ok: true,
  hasDb: hasDb(c.env),
  hasMediaBucket: hasMediaBucket(c.env),
}))

app.post('/api/contact', handleContact)

app.get('/api/projects', async (c) => {
  if (!hasDb(c.env)) {
    return publicJson({ data: [], source: 'static-fallback', configured: false })
  }

  try {
    const projects = await listProjects(c.env.DB)
    return publicJson({ data: projects.map((project) => normalizeProjectMedia(project, c.env)), source: 'd1', configured: true })
  } catch (error) {
    return jsonResponse({ data: [], source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.get('/api/content/:page', (c) => publicJson({ page: c.req.param('page'), data: null, source: 'static-fallback' }))
app.get('/api/services', async (c) => {
  if (!hasDb(c.env)) {
    return publicJson({ data: null, source: 'static-fallback', configured: false })
  }

  try {
    const data = await getServicesContent(c.env.DB)
    return publicJson({ data, source: 'd1', configured: true })
  } catch (error) {
    return jsonResponse({ data: null, source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.get('/api/resources', async (c) => {
  if (!hasDb(c.env)) {
    return publicJson({ data: null, source: 'static-fallback', configured: false })
  }

  try {
    const data = await getResourcesContent(c.env.DB)
    return publicJson({ data, source: 'd1', configured: true })
  } catch (error) {
    return jsonResponse({ data: null, source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.get('/api/profile-content', async (c) => {
  if (!hasDb(c.env)) {
    return publicJson({ data: null, source: 'static-fallback', configured: false })
  }

  try {
    const data = await getProfileContent(c.env.DB)
    return publicJson({ data, source: 'd1', configured: true })
  } catch (error) {
    return jsonResponse({ data: null, source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.get('/api/site-settings', async (c) => {
  if (!hasDb(c.env)) {
    return publicJson({ data: null, source: 'static-fallback', configured: false })
  }

  try {
    const data = await getSiteSettingsContent(c.env.DB)
    return publicJson({ data, source: 'd1', configured: true })
  } catch (error) {
    return jsonResponse({ data: null, source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.get('/api/seo/:pageSlug', async (c) => {
  if (!hasDb(c.env)) {
    return publicJson({ data: null, source: 'static-fallback', configured: false })
  }

  try {
    const data = await getSeoMetadata(c.env.DB, c.req.param('pageSlug'))
    return publicJson({ data, source: data ? 'd1' : 'static-fallback', configured: Boolean(data) })
  } catch (error) {
    return jsonResponse({ data: null, source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.post('/api/admin/login', handleAdminLogin)
app.post('/api/admin/logout', handleAdminLogout)
app.use('/api/admin/*', requireAdmin)

app.get('/api/admin/session', (c) => c.json({
  ok: true,
  email: c.get('adminEmail'),
  role: c.get('adminRole') || 'admin',
  mode: c.get('adminAuthMode') || 'cloudflare-access',
}))

app.get('/api/admin/projects', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const projects = await listProjects(c.env.DB, { includeDrafts: true })
  return c.json(
    projects.map((project) => normalizeProjectMedia(project, c.env)),
    200,
    { 'X-Total-Count': String(projects.length) },
  )
})

app.get('/api/admin/projects/:id', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const project = await getProject(c.env.DB, c.req.param('id'), { includeDrafts: true })
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404)
  return c.json(normalizeProjectMedia(project, c.env))
})

app.get('/api/admin/content/services', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)
  const data = await getServicesContent(c.env.DB, { includeDrafts: true })
  return c.json(data)
})

app.put('/api/admin/content/services', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const data = await replaceServicesContent(c.env.DB, await c.req.json())
    return c.json(data)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.get('/api/admin/content/resources', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)
  const data = await getResourcesContent(c.env.DB, { includeDrafts: true })
  return c.json(data)
})

app.put('/api/admin/content/resources', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const data = await replaceResourcesContent(c.env.DB, await c.req.json())
    return c.json(data)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.get('/api/admin/content/profile', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)
  const data = await getProfileContent(c.env.DB, { includeDrafts: true })
  return c.json(data)
})

app.put('/api/admin/content/profile', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const data = await replaceProfileContent(c.env.DB, await c.req.json())
    return c.json(data)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.get('/api/admin/content/site-settings', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)
  const data = await getSiteSettingsContent(c.env.DB, { includeDrafts: true })
  return c.json(data)
})

app.put('/api/admin/content/site-settings', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const data = await replaceSiteSettingsContent(c.env.DB, await c.req.json())
    return c.json(data)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.get('/api/admin/content/seo', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)
  const data = await getSeoContent(c.env.DB)
  return c.json(data)
})

app.put('/api/admin/content/seo', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const data = await replaceSeoContent(c.env.DB, await c.req.json())
    return c.json(data)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.post('/api/admin/projects', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const project = await upsertProject(c.env.DB, await c.req.json())
    return c.json(normalizeProjectMedia(project, c.env), 201)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.put('/api/admin/projects/:id', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const payload = await c.req.json()
    const project = await upsertProject(c.env.DB, { ...payload, id: c.req.param('id') })
    return c.json(normalizeProjectMedia(project, c.env))
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.patch('/api/admin/projects/:id', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const existing = await getProject(c.env.DB, c.req.param('id'), { includeDrafts: true })
    if (!existing) return jsonResponse({ error: 'Project not found.' }, 404)
    const payload = await c.req.json()
    const project = await upsertProject(c.env.DB, { ...existing, ...payload, id: c.req.param('id') })
    return c.json(normalizeProjectMedia(project, c.env))
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.delete('/api/admin/projects/:id', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const deleted = await deleteProject(c.env.DB, c.req.param('id'))
  return c.json(deleted)
})

app.post('/api/admin/media', async (c) => {
  if (!hasMediaBucket(c.env)) return jsonResponse({ error: 'R2 MEDIA_BUCKET binding is not configured.' }, 503)
  if (!String(c.env.R2_PUBLIC_BASE_URL || '').trim()) {
    return jsonResponse({ error: 'R2_PUBLIC_BASE_URL is not configured.' }, 503)
  }

  const formData = await c.req.formData()
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
  await c.env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { uploadedAt: nowIso() },
  })

  const publicBaseUrl = c.env.R2_PUBLIC_BASE_URL || ''
  return c.json({
    key,
    filename: file.name,
    contentType: file.type,
    size: file.size,
    url: publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : key,
  }, 201)
})

app.notFound((c) => {
  const url = new URL(c.req.url)

  if (url.hostname === 'devlabstudios.com') {
    url.hostname = 'www.devlabstudios.com'
    return Response.redirect(url.toString(), 301)
  }

  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
