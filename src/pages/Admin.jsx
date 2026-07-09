import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Refine } from '@refinedev/core'
import simpleRestProvider from '@refinedev/simple-rest'
import ProjectsManager from '../components/admin/ProjectsManager'
import ContentManager from '../components/admin/ContentManager'
import SiteSettingsManager from '../components/admin/SiteSettingsManager'
import SeoManager from '../components/admin/SeoManager'

const sections = [
  {
    id: 'projects',
    label: 'Projects',
    title: 'Project Manager',
    subtitle: 'Manage portfolio projects from D1 and store public media in R2.',
  },
  {
    id: 'services',
    label: 'Services',
    title: 'Services CMS',
    subtitle: 'Manage solution categories, process steps, and service FAQ content.',
  },
  {
    id: 'resources',
    label: 'Resources',
    title: 'Resources CMS',
    subtitle: 'Manage feed posts, readable guides, and readiness playbook content.',
  },
  {
    id: 'profile',
    label: 'Profile',
    title: 'Profile CMS',
    subtitle: 'Manage founder profile, experience, skills, and system capability content.',
  },
  {
    id: 'site-settings',
    label: 'Site Settings',
    title: 'Site Settings CMS',
    subtitle: 'Manage navigation, CTA labels, footer copy, quick links, and social links.',
  },
  {
    id: 'seo',
    label: 'SEO',
    title: 'SEO CMS',
    subtitle: 'Manage page titles, descriptions, canonical links, and social metadata.',
  },
]

function Admin() {
  const [activeSection, setActiveSection] = useState('projects')
  const section = sections.find((item) => item.id === activeSection) || sections[0]

  return (
    <Refine dataProvider={simpleRestProvider('/api/admin')} resources={[{ name: 'projects' }]}>
      <Helmet>
        <title>Admin - DevLab Studios CMS</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">CMS Admin</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950">{section.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{section.subtitle}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    activeSection === item.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          {activeSection === 'projects' ? <ProjectsManager /> : null}
          {['services', 'resources', 'profile'].includes(activeSection) ? <ContentManager contentType={activeSection} /> : null}
          {activeSection === 'site-settings' ? <SiteSettingsManager /> : null}
          {activeSection === 'seo' ? <SeoManager /> : null}
        </div>
      </div>
    </Refine>
  )
}

export default Admin
