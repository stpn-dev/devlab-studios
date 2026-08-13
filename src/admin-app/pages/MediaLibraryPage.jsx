import { useEffect, useState } from 'react'
import { Database, ExternalLink, FolderOpen, HardDrive, Image } from '../../components/icons/icons'
import { adminApi } from '../lib/adminApi'

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function MediaLibraryPage() {
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let ignore = false
    adminApi
      .get('/api/admin/media')
      .then((data) => {
        if (ignore) return
        setAssets(data.assets || [])
        setSummary(data.summary || null)
        setStatus('ready')
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [])

  const metrics = [
    { label: 'R2 objects', value: summary?.objectCount || 0, icon: HardDrive },
    { label: 'Images', value: summary?.imageCount || 0, icon: Image },
    { label: 'Storage shown', value: formatBytes(summary?.totalBytes), icon: FolderOpen },
    { label: 'D1 metadata', value: `${summary?.trackedCount || 0} linked`, icon: Database },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <HardDrive className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">Cloudflare R2</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Media Library</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              This is the inventory of files stored in the current environment&apos;s R2 bucket. Upload from a Project, Article, Case Study, or Profile editor; use this page to confirm the object exists, preview it, and see its storage path and metadata.
            </p>
          </div>
        </div>
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading R2 inventoryâ€¦</p> : null}
      {status === 'error' ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Could not load the current environment&apos;s R2 bucket.</p> : null}

      {status === 'ready' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-violet-600"><Icon className="h-4 w-4" aria-hidden="true" /></div>
                </div>
              </div>
            ))}
          </div>

          {assets.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {assets.map((asset) => (
                <a key={asset.id} href={asset.url || undefined} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
                  {asset.contentType?.startsWith('image/') && asset.url ? (
                    <img src={asset.url} alt={asset.altText || asset.filename} className="h-40 w-full bg-slate-50 object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-slate-50 text-xs text-slate-400">{asset.contentType}</div>
                  )}
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{asset.filename}</p>
                      <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-violet-600" aria-hidden="true" />
                    </div>
                    <p className="truncate font-mono text-[11px] text-slate-500" title={asset.key}>{asset.key}</p>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{formatBytes(asset.size)}</span>
                      <span className={asset.trackedInD1 ? 'text-emerald-600' : 'text-slate-400'}>{asset.trackedInD1 ? 'D1 linked' : 'R2 only'}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <FolderOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold text-slate-800">This environment&apos;s R2 bucket is empty</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Upload an image from a content editor. It will be stored in R2 and will appear here automaticallyâ€”even if no D1 tracking row exists.</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export default MediaLibraryPage
