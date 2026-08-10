import { copyFileSync, mkdirSync } from 'fs'

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
}

mkdirSync(DEST_DIR, { recursive: true })

for (const [toolKey, slug] of Object.entries(LOGO_SLUGS)) {
  copyFileSync(`${SOURCE_DIR}/${slug}.svg`, `${DEST_DIR}/${toolKey}.svg`)
  console.log(`copied ${slug}.svg -> ${DEST_DIR}/${toolKey}.svg`)
}

console.log('\nStill needed (no simple-icons entry — source from official brand/press kits):')
console.log('  - OpenAI: https://openai.com/brand (or their press kit)')
console.log('  - GoHighLevel: https://www.gohighlevel.com (check their partner/affiliate brand assets page)')
console.log(`Save those two as ${DEST_DIR}/openai.svg and ${DEST_DIR}/highlevel.svg once sourced.`)
