// Structured data: Core tools in use
// Logos are imported with the `?url` suffix so Vite/Astro's asset pipeline
// resolves them to plain URL strings instead of ImageMetadata objects,
// matching the `logo?: string` shape consumed by ToolsMarquee.
import reactLogo from '../assets/tool-logos/react.svg?url'
import tailwindLogo from '../assets/tool-logos/tailwind.svg?url'
import viteLogo from '../assets/tool-logos/vite.svg?url'
import routerLogo from '../assets/tool-logos/router.svg?url'
import githubLogo from '../assets/tool-logos/github.svg?url'
import cloudflareLogo from '../assets/tool-logos/cloudflare.svg?url'
import zapierLogo from '../assets/tool-logos/zapier.svg?url'
import makeLogo from '../assets/tool-logos/make.svg?url'
import n8nLogo from '../assets/tool-logos/n8n.svg?url'
import googleLogo from '../assets/tool-logos/google.svg?url'
import notionLogo from '../assets/tool-logos/notion.svg?url'
import airtableLogo from '../assets/tool-logos/airtable.svg?url'
import astroLogo from '../assets/tool-logos/astro.svg?url'
import claudeLogo from '../assets/tool-logos/claude.svg?url'
import postmanLogo from '../assets/tool-logos/postman.svg?url'
import springbootLogo from '../assets/tool-logos/springboot.svg?url'
import nextjsLogo from '../assets/tool-logos/nextjs.svg?url'
import typescriptLogo from '../assets/tool-logos/typescript.svg?url'
import javascriptLogo from '../assets/tool-logos/javascript.svg?url'
import gitLogo from '../assets/tool-logos/git.svg?url'
import vercelLogo from '../assets/tool-logos/vercel.svg?url'
import phpLogo from '../assets/tool-logos/php.svg?url'
import javaLogo from '../assets/tool-logos/java.svg?url'

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
  { key: 'openai', label: 'OpenAI / AI Tools', icon: 'Robot' },
  { key: 'highlevel', label: 'GoHighLevel', icon: 'Briefcase' },
  { key: 'astro', label: 'Astro', icon: 'Code2', logo: astroLogo },
  { key: 'claude', label: 'Claude', icon: 'Sparkles', logo: claudeLogo },
  { key: 'postman', label: 'Postman', icon: 'Send', logo: postmanLogo },
  { key: 'springboot', label: 'Spring Boot', icon: 'Leaf', logo: springbootLogo },
  { key: 'nextjs', label: 'Next.js', icon: 'Code2', logo: nextjsLogo },
  { key: 'typescript', label: 'TypeScript', icon: 'Code2', logo: typescriptLogo },
  { key: 'javascript', label: 'JavaScript', icon: 'Code2', logo: javascriptLogo },
  { key: 'git', label: 'Git', icon: 'GitBranch', logo: gitLogo },
  { key: 'vercel', label: 'Vercel', icon: 'Triangle', logo: vercelLogo },
  { key: 'php', label: 'PHP', icon: 'Code2', logo: phpLogo },
  { key: 'java', label: 'Java', icon: 'Coffee', logo: javaLogo },
  { key: 'retellai', label: 'Retell AI', icon: 'Phone' },
  { key: 'twilio', label: 'Twilio', icon: 'MessageSquare' },
  { key: 'sql', label: 'SQL / Databases', icon: 'Database' },
]

// Provide a default export for resilience in dev/preview environments
export default { coreTools }
