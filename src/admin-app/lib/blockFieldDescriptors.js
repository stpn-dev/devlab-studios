// Field descriptors for each of the 13 approved page-composition block
// types' `props` shape (see src/lib/schemas/blocks.ts) — the constrained
// building blocks editors compose Home/About/Process from. Nested
// array/object props (CTAs, list items) use the 'json' field type as an
// explicit, visible escape hatch rather than a bespoke widget per shape;
// promoting any of these to a dedicated array-of-object editor is a
// reasonable follow-up once real page content shows which ones need it.

export const BLOCK_LABELS = {
  hero: 'Hero',
  richText: 'Rich Text',
  stats: 'Stats',
  processSteps: 'Process Steps',
  experienceTimeline: 'Experience Timeline',
  servicesGrid: 'Services Grid',
  featuredProjects: 'Featured Projects',
  featuredCaseStudies: 'Featured Case Studies',
  testimonials: 'Testimonials',
  faq: 'FAQ',
  resourceCards: 'Resource Cards',
  imageGallery: 'Image Gallery',
  cta: 'Call to Action',
}

export const BLOCK_FIELDS = {
  hero: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' },
    { name: 'heading', label: 'Heading', type: 'text', required: true },
    { name: 'subheading', label: 'Subheading', type: 'textarea' },
    { name: 'imageUrl', label: 'Image URL', type: 'url' },
    { name: 'primaryCta', label: 'Primary CTA', type: 'json', help: '{ "label": "...", "href": "..." }' },
    { name: 'secondaryCta', label: 'Secondary CTA', type: 'json', help: '{ "label": "...", "href": "..." }' },
  ],
  richText: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'body', label: 'Body', type: 'textarea', required: true },
  ],
  stats: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'items', label: 'Items', type: 'json', help: '[{ "label": "...", "value": "..." }]' },
  ],
  processSteps: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'steps', label: 'Steps', type: 'json', help: '[{ "title": "...", "description": "...", "icon": "..." }]' },
  ],
  experienceTimeline: [
    { name: 'heading', label: 'Heading', type: 'text' },
  ],
  servicesGrid: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'serviceIds', label: 'Service IDs', type: 'json', help: '["service-id-1", "service-id-2"]' },
  ],
  featuredProjects: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'limit', label: 'Limit', type: 'number' },
  ],
  featuredCaseStudies: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'limit', label: 'Limit', type: 'number' },
  ],
  testimonials: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'limit', label: 'Limit', type: 'number' },
  ],
  faq: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'context', label: 'Context', type: 'text', help: 'Matches an FAQ context tag, e.g. "general".' },
  ],
  resourceCards: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'limit', label: 'Limit', type: 'number' },
  ],
  imageGallery: [
    { name: 'heading', label: 'Heading', type: 'text' },
    { name: 'images', label: 'Images', type: 'json', help: '[{ "url": "...", "alt": "..." }]' },
  ],
  cta: [
    { name: 'heading', label: 'Heading', type: 'text', required: true },
    { name: 'body', label: 'Body', type: 'textarea' },
    { name: 'primaryCta', label: 'Primary CTA', type: 'json', required: true, help: '{ "label": "...", "href": "..." }' },
  ],
}

export const PAGE_BLOCK_TYPES = Object.keys(BLOCK_LABELS)

export function createEmptyBlockProps(type) {
  const empty = {}
  for (const field of BLOCK_FIELDS[type] || []) {
    if (field.type === 'json') empty[field.name] = field.name.endsWith('Cta') ? { label: '', href: '' } : []
    else if (field.type === 'number') empty[field.name] = 3
    else empty[field.name] = ''
  }
  return empty
}
