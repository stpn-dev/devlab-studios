import { useEffect, useState } from 'react'
import { adminApi } from '../lib/adminApi'

function MediaLibraryPage() {
  const [assets, setAssets] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let ignore = false
    adminApi
      .get('/api/admin/media')
      .then((data) => !ignore && (setAssets(data), setStatus('ready')))
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Media Library</h1>
        <p className="mt-1 text-sm text-slate-500">
          Files uploaded through Projects, Articles, and other editors. Uploads happen from within each editor — this is a read-only index of what's already in R2.
        </p>
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load media assets.</p> : null}

      {status === 'ready' ? (
        assets.length ? (
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {asset.contentType?.startsWith('image/') ? (
                  <img src={asset.url} alt={asset.altText || asset.filename} className="h-32 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-slate-50 text-xs text-slate-400">{asset.contentType}</div>
                )}
                <div className="p-2">
                  <p className="truncate text-xs font-semibold text-slate-700">{asset.filename}</p>
                  <p className="text-xs text-slate-400">{asset.folder} · {Math.round(asset.size / 1024)} KB</p>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No media uploaded yet.</p>
        )
      ) : null}
    </div>
  )
}

export default MediaLibraryPage
