// Structured data: Core tools in use
import reactLogo from '../assets/tool-logos/react.svg'
import tailwindLogo from '../assets/tool-logos/tailwind.svg'
import viteLogo from '../assets/tool-logos/vite.svg'
import routerLogo from '../assets/tool-logos/router.svg'
import githubLogo from '../assets/tool-logos/github.svg'
import cloudflareLogo from '../assets/tool-logos/cloudflare.svg'
import zapierLogo from '../assets/tool-logos/zapier.svg'
import makeLogo from '../assets/tool-logos/make.svg'
import n8nLogo from '../assets/tool-logos/n8n.svg'
import googleLogo from '../assets/tool-logos/google.svg'
import notionLogo from '../assets/tool-logos/notion.svg'
import airtableLogo from '../assets/tool-logos/airtable.svg'
import astroLogo from '../assets/tool-logos/astro.svg'
import openaiLogo from '../assets/tool-logos/openai.svg'
import highlevelLogo from '../assets/tool-logos/highlevel.svg'

export const coreTools = [
  { key: 'react', label: 'React', icon: 'Code2', logo: reactLogo },
  { key: 'tailwind', label: 'Tailwind CSS', icon: 'Lightbulb', logo: tailwindLogo },
  { key: 'vite', label: 'Vite', icon: 'Settings', logo: viteLogo },
  { key: 'router', label: 'React Router', icon: 'ArrowRight', logo: routerLogo },
  { key: 'github', label: 'GitHub + Git', icon: 'Briefcase', logo: githubLogo },
  { key: 'cloudflare', label: 'Cloudflare Pages', icon: 'Shield', logo: cloudflareLogo },
  { key: 'zapier', label: 'Zapier', icon: 'Zap', logo: zapierLogo },
  { key: 'make', label: 'Make (Integromat)', icon: 'Settings', logo: makeLogo },
  { key: 'n8n', label: 'n8n', icon: 'Wrench', logo: n8nLogo },
  { key: 'google', label: 'Google Workspace', icon: 'Mail', logo: googleLogo },
  { key: 'notion', label: 'Notion', icon: 'Lightbulb', logo: notionLogo },
  { key: 'airtable', label: 'Airtable', icon: 'Lightbulb', logo: airtableLogo },
  { key: 'apis', label: 'API Integrations', icon: 'Code2' },
  { key: 'openai', label: 'OpenAI / AI Tools', icon: 'Robot', logo: openaiLogo },
  { key: 'highlevel', label: 'GoHighLevel', icon: 'Briefcase', logo: highlevelLogo },
  { key: 'astro', label: 'Astro', icon: 'Code2', logo: astroLogo },
]

// Provide a default export for resilience in dev/preview environments
export default { coreTools }
