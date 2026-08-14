import { useState } from 'react'
import { useParams } from 'react-router-dom'
import ProjectsManager from '../../components/admin/ProjectsManager'
import ContentManager from '../../components/admin/ContentManager'
import SiteSettingsManager from '../../components/admin/SiteSettingsManager'
import SeoManager from '../../components/admin/SeoManager'
import VersionHistoryPanel from './VersionHistoryPanel'
import PublicUsageNotice from '../components/PublicUsageNotice'

/**
 * Hosts the existing bespoke singleton/collection editors (built pre-shell)
 * under the new shell's routing. Their editing UI is intentionally not
 * rewritten onto the generic SchemaForm system — the icon picker, the
 * resource post library, and project image upload are all bespoke UX a
 * generic form would regress — but every type here now shares the same
 * version history + audit log plumbing as the schema-driven collections
 * (see src/pages/api/admin/content/[type].ts). Projects has its own
 * per-project history inside ProjectsManager instead of the page-level
 * toggle below, since a project isn't a single singleton blob.
 */
function ContentTypePage() {
  const { type } = useParams()
  const [showHistory, setShowHistory] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  function handleRestored() {
    setShowHistory(false)
    setRefreshKey((key) => key + 1)
  }

  let manager = null
  if (type === 'projects') manager = <ProjectsManager key={refreshKey} />
  else if (type === 'site-settings') manager = <SiteSettingsManager key={refreshKey} />
  else if (type === 'seo') manager = <SeoManager key={refreshKey} />
  else if (type === 'services' || type === 'resources' || type === 'profile') manager = <ContentManager key={refreshKey} contentType={type} />

  if (!manager) return <p className="text-rose-600">Unknown content type: {type}</p>

  const supportsPageLevelHistory = type !== 'projects'

  return (
    <div className="space-y-4">
      <PublicUsageNotice contentType={type} />
      {supportsPageLevelHistory ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {showHistory ? 'Hide History' : 'Version History'}
          </button>
        </div>
      ) : null}

      {supportsPageLevelHistory && showHistory ? (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <VersionHistoryPanel contentType={type} contentId={null} onRestored={handleRestored} />
        </div>
      ) : null}

      {manager}
    </div>
  )
}

export default ContentTypePage
