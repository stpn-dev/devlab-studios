import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Database, FolderOpen, HardDrive, Image, Upload } from '../../components/icons/icons'
import { adminApi } from '../lib/adminApi'
import { formatBytes } from '../lib/formatBytes'
import { validateAndConvertToWebP } from '../../utils/imageUpload'
import MediaAssetGrid from '../components/MediaAssetGrid'
import MediaAssetTable from '../components/MediaAssetTable'
import MediaDeleteConflictDialog from '../components/MediaDeleteConflictDialog'

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
  const [conflictReferences, setConflictReferences] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'details' ? 'details' : 'grid'

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
      if (error.references?.length) {
        setConflictReferences(error.references)
      } else {
        setMessage({ tone: 'error', text: error.message })
      }
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-1 text-sm font-semibold text-slate-700">
              <button type="button" onClick={() => setSearchParams((params) => { params.set('view', 'grid'); return params })} className={`rounded px-3 py-1.5 ${view === 'grid' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>Medium icons</button>
              <button type="button" onClick={() => setSearchParams((params) => { params.set('view', 'details'); return params })} className={`rounded px-3 py-1.5 ${view === 'details' ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>Details</button>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {busyKey === 'upload' ? 'Optimizing…' : 'Upload Image'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={Boolean(busyKey)} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = '' }} />
            </label>
          </div>
        </div>
      </div>

      {conflictReferences ? (
        <MediaDeleteConflictDialog references={conflictReferences} onClose={() => setConflictReferences(null)} />
      ) : null}
      {message ? <p className={`rounded-xl border p-4 text-sm ${message.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>{message.text}</p> : null}
      {status === 'loading' ? <p className="text-sm text-slate-500">Loading R2 inventory…</p> : null}
      {status === 'error' ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Could not load this environment’s R2 bucket.</p> : null}

      {status === 'ready' ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-900">{value}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-violet-600"><Icon className="h-4 w-4" aria-hidden="true" /></div></div></div>)}</div>
        {view === 'grid'
          ? <MediaAssetGrid assets={assets} busyKey={busyKey} onReplace={replace} onRemove={remove} />
          : <MediaAssetTable assets={assets} busyKey={busyKey} onReplace={replace} onRemove={remove} />}
      </> : null}
    </div>
  )
}

export default MediaLibraryPage
