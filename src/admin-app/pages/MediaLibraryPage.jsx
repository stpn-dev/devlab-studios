import { useCallback, useEffect, useState } from 'react'
import { Database, ExternalLink, FolderOpen, HardDrive, Image, RotateCw, Trash2, Upload } from '../../components/icons/icons'
import { adminApi } from '../lib/adminApi'
import { validateAndConvertToWebP } from '../../utils/imageUpload'

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function mediaRequest(method, body, query = '') {
  const response = await fetch(`/api/admin/media${query}`, { method, body, credentials: 'include' })
  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.error || `Media request failed (${response.status}).`)
    error.references = data.references || []
    throw error
  }
  return data
}

function MediaLibraryPage() {
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState(null)
  const [busyKey, setBusyKey] = useState('')

  const loadAssets = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await adminApi.get('/api/admin/media')
      setAssets((data.assets || []).filter((asset) => asset.size > 0 && asset.contentType?.startsWith('image/')))
      setSummary(data.summary || null)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  async function optimizedFile(rawFile) {
    const result = await validateAndConvertToWebP(rawFile)
    setMessage({ tone: 'info', text: `Optimized ${formatBytes(result.original.size)} to ${formatBytes(result.converted.size)} at ${result.converted.width}×${result.converted.height}.` })
    return result.file
  }

  async function upload(rawFile) {
    if (!rawFile) return
    setBusyKey('upload')
    setMessage(null)
    try {
      const file = await optimizedFile(rawFile)
      const body = new FormData()
      body.set('file', file)
      body.set('folder', 'uploads')
      await mediaRequest('POST', body)
      setMessage({ tone: 'success', text: 'Optimized image uploaded to this environment’s R2 bucket.' })
      await loadAssets()
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally { setBusyKey('') }
  }

  async function replace(asset, rawFile) {
    if (!rawFile) return
    setBusyKey(asset.key)
    setMessage(null)
    try {
      const file = await optimizedFile(rawFile)
      const body = new FormData()
      body.set('oldKey', asset.key)
      body.set('file', file)
      const result = await mediaRequest('PATCH', body)
      setMessage({ tone: 'success', text: `Media replaced safely. ${result.referencesUpdated} reference${result.referencesUpdated === 1 ? '' : 's'} updated.` })
      await loadAssets()
    } catch (error) {
      setMessage({ tone: 'error', text: error.message })
    } finally { setBusyKey('') }
  }

  async function remove(asset) {
    if (!window.confirm(`Delete “${asset.filename}” from R2? This is only allowed when the image is not referenced by content.`)) return
    setBusyKey(asset.key)
    setMessage(null)
    try {
      await mediaRequest('DELETE', null, `?key=${encodeURIComponent(asset.key)}`)
      setMessage({ tone: 'success', text: `Deleted ${asset.filename}.` })
      await loadAssets()
    } catch (error) {
      const usages = error.references?.map((item) => `${item.type}: ${item.label}`).join(', ')
      setMessage({ tone: 'error', text: usages ? `${error.message} Used by ${usages}.` : error.message })
    } finally { setBusyKey('') }
  }

  const metrics = [
    { label: 'R2 objects', value: summary?.objectCount || 0, icon: HardDrive },
    { label: 'Images', value: summary?.imageCount || 0, icon: Image },
    { label: 'Storage shown', value: formatBytes(summary?.totalBytes), icon: FolderOpen },
    { label: 'D1 metadata', value: `${summary?.trackedCount || 0} linked`, icon: Database },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><HardDrive className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">Cloudflare R2</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Media Library</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Optimized public images in the current environment. Replace updates existing content references; delete is blocked while an image is in use.</p>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {busyKey === 'upload' ? 'Optimizing…' : 'Upload Image'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={Boolean(busyKey)} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = '' }} />
          </label>
        </div>
      </div>

      {message ? <p className={`rounded-xl border p-4 text-sm ${message.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>{message.text}</p> : null}
      {status === 'loading' ? <p className="text-sm text-slate-500">Loading R2 inventory…</p> : null}
      {status === 'error' ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Could not load this environment’s R2 bucket.</p> : null}

      {status === 'ready' ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-900">{value}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-violet-600"><Icon className="h-4 w-4" aria-hidden="true" /></div></div></div>)}</div>
        {assets.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{assets.map((asset) => <article key={asset.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <img src={asset.url} alt={asset.altText || asset.filename} className="h-40 w-full bg-slate-50 object-cover" loading="lazy" />
          <div className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-slate-800">{asset.filename}</p><a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.filename}`}><ExternalLink className="h-4 w-4 text-slate-400 hover:text-violet-600" /></a></div>
            <p className="truncate font-mono text-[11px] text-slate-500" title={asset.key}>{asset.key}</p>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{formatBytes(asset.size)}</span><span className={asset.trackedInD1 ? 'text-emerald-600' : 'text-slate-400'}>{asset.trackedInD1 ? 'D1 linked' : 'R2 only'}</span></div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RotateCw className="h-3.5 w-3.5" />{busyKey === asset.key ? 'Working…' : 'Replace'}<input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={Boolean(busyKey)} onChange={(event) => { replace(asset, event.target.files?.[0]); event.target.value = '' }} /></label>
              <button type="button" disabled={Boolean(busyKey)} onClick={() => remove(asset)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
            </div>
          </div>
        </article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><FolderOpen className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold text-slate-800">No image objects found</h2><p className="mt-2 text-sm text-slate-500">Upload a JPG, PNG, WebP, or AVIF. The CMS will resize it when needed and store an optimized WebP.</p></div>}
      </> : null}
    </div>
  )
}

export default MediaLibraryPage
