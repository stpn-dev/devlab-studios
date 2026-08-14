import { Briefcase, FileText, Home, Info, Settings, User, Wrench } from '../components/icons/icons'

/**
 * The public information architecture in one place. Admin navigation and
 * usage guidance consume this registry so CMS labels cannot drift from the
 * routes visitors actually see.
 */
export const PUBLIC_SURFACES = [
  { key: 'home', label: 'Home', publicPath: '/', adminPath: '/admin/pages/home', icon: Home, primary: true, description: 'Homepage sections and landing-page calls to action.' },
  { key: 'about', label: 'About', publicPath: '/about', adminPath: '/admin/pages/about', icon: Info, primary: true, description: 'Studio overview, mission, capabilities, FAQ, and next step.' },
  { key: 'services', label: 'Services', publicPath: '/services', adminPath: '/admin/pages/services', icon: Settings, primary: true, description: 'Services page framing, solution categories, delivery steps, related projects, and FAQ.' },
  { key: 'work', label: 'Work', publicPath: '/work', adminPath: '/admin/pages/work', icon: Briefcase, primary: true, description: 'Selected projects and their Work-specific write-ups.' },
  { key: 'insights', label: 'Insights', publicPath: '/insights', adminPath: '/admin/pages/insights', icon: FileText, primary: true, description: 'Insights page framing and its published article feed.' },
  { key: 'profile', label: 'Profile', publicPath: '/profile', adminPath: '/admin/content/profile', icon: User, primary: true, description: 'Founder profile, experience, skills, tools, certifications, and portfolio.' },
  { key: 'process', label: 'Process', publicPath: '/process', adminPath: '/admin/pages/process', icon: Wrench, primary: false, description: 'Supporting process page and delivery phases.' },
  { key: 'contact', label: 'Contact', publicPath: '/contact', adminPath: '/admin/pages/contact', icon: FileText, primary: false, description: 'Contact-page introduction, form labels, and response guidance.' },
]

export const PRIMARY_PUBLIC_SURFACES = PUBLIC_SURFACES.filter((surface) => surface.primary)
export const SUPPORTING_PUBLIC_SURFACES = PUBLIC_SURFACES.filter((surface) => !surface.primary)

export const CONTENT_USAGE = {
  projects: { label: 'Projects', publicPaths: ['/work', '/services', '/profile'], description: 'Project records are selected by Work, referenced by Services, and displayed in the Profile portfolio.' },
  services: { label: 'Services', publicPaths: ['/services'], description: 'Controls the public Services page.' },
  resources: { label: 'Insights', publicPaths: ['/insights'], description: 'Each record is an article published in the public Insights feed.' },
  profile: { label: 'Profile', publicPaths: ['/profile'], description: 'Controls the public Profile page.' },
  certifications: { label: 'Certifications', publicPaths: ['/profile'], description: 'Certification records are displayed inside Profile.' },
  'site-settings': { label: 'Navigation & Footer', publicPaths: ['All public pages'], description: 'Controls shared navigation, calls to action, footer links, and contact details.' },
  seo: { label: 'SEO', publicPaths: ['All public pages'], description: 'Controls page titles, descriptions, canonical URLs, and social metadata.' },
}

export function getContentUsage(type) {
  return CONTENT_USAGE[type] || null
}
