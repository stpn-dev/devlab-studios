import { useParams } from 'react-router-dom'
import ProjectsManager from '../../components/admin/ProjectsManager'
import ContentManager from '../../components/admin/ContentManager'
import SiteSettingsManager from '../../components/admin/SiteSettingsManager'
import SeoManager from '../../components/admin/SeoManager'

/**
 * Hosts the existing bespoke singleton/collection editors (built pre-shell)
 * under the new shell's routing. Not yet rewritten onto the schema-form
 * system — see docs/content-model.md for what's still ad-hoc vs
 * schema-driven.
 */
function ContentTypePage() {
  const { type } = useParams()

  if (type === 'projects') return <ProjectsManager />
  if (type === 'site-settings') return <SiteSettingsManager />
  if (type === 'seo') return <SeoManager />
  if (type === 'services' || type === 'resources' || type === 'profile') return <ContentManager contentType={type} />

  return <p className="text-rose-600">Unknown content type: {type}</p>
}

export default ContentTypePage
