import { useEffect, useState } from 'react'
import { adminApi } from '../lib/adminApi'

function VersionHistoryPanel({ contentType, contentId = null, onRestored }) {
  const [versions, setVersions] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let ignore = false
    const query = contentId ? `?id=${encodeURIComponent(contentId)}` : ''
    adminApi
      .get(`/api/admin/versions/${contentType}${query}`)
      .then((data) => {
        if (!ignore) {
          setVersions(data)
          setStatus('ready')
        }
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [contentType, contentId])

  async function handleRestore(versionNumber) {
    if (!window.confirm(`Restore version ${versionNumber}? This creates a new version on top of the current one — nothing is deleted.`)) return
    const restored = await adminApi.post(`/api/admin/versions/${contentType}/rollback`, { contentId, versionNumber })
    onRestored?.(restored)
  }

  if (status === 'loading') return <p className="text-sm text-slate-500">Loading version history…</p>
  if (status === 'error') return <p className="text-sm text-rose-600">Could not load version history.</p>
  if (!versions.length) return <p className="text-sm text-slate-500">No saved versions yet.</p>

  return (
    <ul className="space-y-2">
      {versions.map((version) => (
        <li key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div>
            <span className="font-semibold text-slate-700">v{version.versionNumber}</span>
            <span className="ml-2 text-slate-500">{new Date(version.createdAt).toLocaleString()}</span>
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{version.status}</span>
          </div>
          <button type="button" onClick={() => handleRestore(version.versionNumber)} className="text-xs font-semibold text-brand-teal hover:underline">
            Restore
          </button>
        </li>
      ))}
    </ul>
  )
}

export default VersionHistoryPanel
