import { mkdirSync, readFileSync, writeFileSync } from 'fs'

const SOURCE_DIR = 'node_modules/simple-icons/icons'
const DEST_DIR = 'src/assets/tool-logos'

// Maps our tool key -> simple-icons slug. Every slug here was confirmed to
// exist in simple-icons@16.28.0 by listing node_modules/simple-icons/icons/
// directly during planning.
const LOGO_SLUGS = {
  react: 'react',
  tailwind: 'tailwindcss',
  vite: 'vite',
  router: 'reactrouter',
  github: 'github',
  cloudflare: 'cloudflarepages',
  zapier: 'zapier',
  make: 'make',
  n8n: 'n8n',
  google: 'google',
  notion: 'notion',
  airtable: 'airtable',
  astro: 'astro',
  cisco: 'cisco',
  owasp: 'owasp',
}

// simple-icons ships each SVG with no `fill` attribute on its <path>, so the
// grayscale->color hover effect in ToolsMarquee.jsx has no brand color to
// reveal (SVGs render at the default black fill via <img>, which the host
// document's CSS can't reach into). These are each tool's official brand
// hex, already verified — do not source these values independently.
const LOGO_COLORS = {
  react: '#61DAFB',
  tailwind: '#06B6D4',
  vite: '#9135FF',
  router: '#CA4245',
  github: '#181717',
  cloudflare: '#F38020',
  zapier: '#FF4F00',
  make: '#6D00CC',
  n8n: '#EA4B71',
  google: '#4285F4',
  notion: '#000000',
  airtable: '#18BFFF',
  astro: '#BC52EE',
  cisco: '#1BA0D7',
  owasp: '#000000',
}

mkdirSync(DEST_DIR, { recursive: true })

for (const [toolKey, slug] of Object.entries(LOGO_SLUGS)) {
  const source = readFileSync(`${SOURCE_DIR}/${slug}.svg`, 'utf8')
  const colored = source.replace('<path d=', `<path fill="${LOGO_COLORS[toolKey]}" d=`)
  writeFileSync(`${DEST_DIR}/${toolKey}.svg`, colored)
  console.log(`copied ${slug}.svg -> ${DEST_DIR}/${toolKey}.svg (fill=${LOGO_COLORS[toolKey]})`)
}

console.log('\nStill needed (no simple-icons entry — source from official brand/press kits):')
console.log('  - OpenAI: https://openai.com/brand (or their press kit)')
console.log('  - GoHighLevel: https://www.gohighlevel.com (check their partner/affiliate brand assets page)')
console.log(`Save those two as ${DEST_DIR}/openai.svg and ${DEST_DIR}/highlevel.svg once sourced.`)
