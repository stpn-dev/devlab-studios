import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { deleteProject, getProject, listProjects, upsertProject } from './worker/repositories/projects'
import { requireAdmin } from './worker/middleware/adminAuth'
import { jsonResponse, nowIso } from './worker/utils/responses'

const app = new Hono()

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

function hasDb(env) {
  return Boolean(env.DB)
}

function hasMediaBucket(env) {
  return Boolean(env.MEDIA_BUCKET)
}

async function handleContact(c) {
  const webhookUrl = c.env.ZOHO_WEBHOOK_URL
  if (!webhookUrl) {
    return jsonResponse({ error: 'Server misconfiguration: ZOHO_WEBHOOK_URL missing.' }, 500)
  }

  let payload
  try {
    payload = await c.req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400)
  }

  const required = ['name', 'email', 'subject', 'message']
  const missing = required.filter((key) => !String(payload[key] || '').trim())
  if (missing.length > 0) {
    return jsonResponse({ error: `Missing required fields: ${missing.join(', ')}` }, 400)
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
    return c.json({ data: [], source: 'static-fallback', configured: false })
  }

  try {
    const projects = await listProjects(c.env.DB)
    return c.json({ data: projects, source: 'd1', configured: true })
  } catch (error) {
    return jsonResponse({ data: [], source: 'static-fallback', configured: false, error: error.message }, 200)
  }
})

app.get('/api/content/:page', (c) => c.json({ page: c.req.param('page'), data: null, source: 'static-fallback' }))
app.get('/api/services', (c) => c.json({ data: [], source: 'static-fallback' }))
app.get('/api/resources', (c) => c.json({ data: [], source: 'static-fallback' }))
app.get('/api/site-settings', (c) => c.json({ data: null, source: 'static-fallback' }))

app.use('/api/admin/*', requireAdmin)

app.get('/api/admin/session', (c) => c.json({
  ok: true,
  email: c.get('adminEmail'),
  mode: 'cloudflare-access',
}))

app.get('/api/admin/projects', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const projects = await listProjects(c.env.DB, { includeDrafts: true })
  return c.json(projects, 200, { 'X-Total-Count': String(projects.length) })
})

app.get('/api/admin/projects/:id', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const project = await getProject(c.env.DB, c.req.param('id'), { includeDrafts: true })
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404)
  return c.json(project)
})

app.post('/api/admin/projects', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const project = await upsertProject(c.env.DB, await c.req.json())
    return c.json(project, 201)
  } catch (error) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
})

app.put('/api/admin/projects/:id', async (c) => {
  if (!hasDb(c.env)) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const payload = await c.req.json()
    const project = await upsertProject(c.env.DB, { ...payload, id: c.req.param('id') })
    return c.json(project)
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
    return c.json(project)
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

  const formData = await c.req.formData()
  const file = formData.get('file')
  const folder = String(formData.get('folder') || 'uploads').replace(/[^a-z0-9/_-]/gi, '')
  if (!file || typeof file === 'string') return jsonResponse({ error: 'A file upload is required.' }, 400)

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
