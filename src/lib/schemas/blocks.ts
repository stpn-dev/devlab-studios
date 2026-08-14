import { z } from 'zod'

export const iconMotifSchema = z.enum(['fullstack', 'automation', 'data', 'editorial'])
export const ICON_MOTIFS = iconMotifSchema.options

/**
 * The constrained set of page-composition blocks approved for use on
 * block-composed singleton pages (Home, About, Process, Work). Editors can
 * configure and reorder these; nothing else (no arbitrary HTML/JS/CSS).
 * Each block's `props` shape is validated against its own schema below.
 */

const heroBlockSchema = z.object({
  type: z.literal('hero'),
  props: z.object({
    eyebrow: z.string().optional().default(''),
    heading: z.string().min(1),
    subheading: z.string().optional().default(''),
    primaryCta: z.object({ label: z.string(), href: z.string() }).optional(),
    secondaryCta: z.object({ label: z.string(), href: z.string() }).optional(),
    imageUrl: z.string().optional().default(''),
    variant: z.enum(['system', 'editorial', 'compact']).optional().default('editorial'),
    iconMotif: iconMotifSchema.optional().default('fullstack'),
    signals: z.array(z.string()).optional().default([]),
  }),
})

const richTextBlockSchema = z.object({
  type: z.literal('richText'),
  props: z.object({
    heading: z.string().optional().default(''),
    body: z.string().min(1),
  }),
})

const statsBlockSchema = z.object({
  type: z.literal('stats'),
  props: z.object({
    heading: z.string().optional().default(''),
    items: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  }),
})

const processStepsBlockSchema = z.object({
  type: z.literal('processSteps'),
  props: z.object({
    heading: z.string().optional().default(''),
    steps: z.array(z.object({
      title: z.string(),
      description: z.string(),
      icon: z.string().optional().default(''),
    })).default([]),
  }),
})

const experienceTimelineBlockSchema = z.object({
  type: z.literal('experienceTimeline'),
  props: z.object({
    heading: z.string().optional().default(''),
  }),
})

const servicesGridBlockSchema = z.object({
  type: z.literal('servicesGrid'),
  props: z.object({
    heading: z.string().optional().default(''),
    serviceIds: z.array(z.string()).optional().default([]),
  }),
})

const featuredProjectsBlockSchema = z.object({
  type: z.literal('featuredProjects'),
  props: z.object({
    heading: z.string().optional().default(''),
    limit: z.number().int().min(1).max(12).default(3),
  }),
})

const workProjectItemSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().optional().default(''),
  challenge: z.string().optional().default(''),
  systemArchitecture: z.string().optional().default(''),
  deliveryValue: z.string().optional().default(''),
  status: z.enum(['draft', 'published']).optional().default('draft'),
}).superRefine((item, context) => {
  if (item.status !== 'published') return

  const requiredFields = [
    ['description', item.description],
    ['challenge', item.challenge],
    ['systemArchitecture', item.systemArchitecture],
    ['deliveryValue', item.deliveryValue],
  ] as const

  for (const [field, value] of requiredFields) {
    if (!value.trim()) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'Published Work entries require this field.',
      })
    }
  }
})

const workProjectShowcaseBlockSchema = z.object({
  type: z.literal('workProjectShowcase'),
  props: z.object({
    heading: z.string().min(1),
    subheading: z.string().optional().default(''),
    items: z.array(workProjectItemSchema).max(12).default([]),
  }).superRefine((props, context) => {
    const seen = new Set<string>()
    props.items.forEach((item, index) => {
      if (seen.has(item.projectId)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'projectId'],
          message: 'A project can only be featured once on Work.',
        })
      }
      seen.add(item.projectId)
    })
  }),
})

const featuredCaseStudiesBlockSchema = z.object({
  type: z.literal('featuredCaseStudies'),
  props: z.object({
    heading: z.string().optional().default(''),
    subheading: z.string().optional().default(''),
    limit: z.number().int().min(1).max(12).default(3),
  }),
})

const testimonialsBlockSchema = z.object({
  type: z.literal('testimonials'),
  props: z.object({
    heading: z.string().optional().default(''),
    limit: z.number().int().min(1).max(12).default(3),
  }),
})

const faqBlockSchema = z.object({
  type: z.literal('faq'),
  props: z.object({
    heading: z.string().optional().default(''),
    context: z.string().default('general'),
  }),
})

const resourceCardsBlockSchema = z.object({
  type: z.literal('resourceCards'),
  props: z.object({
    heading: z.string().optional().default(''),
    limit: z.number().int().min(1).max(12).default(3),
  }),
})

const imageGalleryBlockSchema = z.object({
  type: z.literal('imageGallery'),
  props: z.object({
    heading: z.string().optional().default(''),
    images: z.array(z.object({ url: z.string(), alt: z.string().default('') })).default([]),
  }),
})

const ctaBlockSchema = z.object({
  type: z.literal('cta'),
  props: z.object({
    heading: z.string().min(1),
    body: z.string().optional().default(''),
    primaryCta: z.object({ label: z.string(), href: z.string() }),
  }),
})

export const pageBlockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  richTextBlockSchema,
  statsBlockSchema,
  processStepsBlockSchema,
  experienceTimelineBlockSchema,
  servicesGridBlockSchema,
  featuredProjectsBlockSchema,
  workProjectShowcaseBlockSchema,
  featuredCaseStudiesBlockSchema,
  testimonialsBlockSchema,
  faqBlockSchema,
  resourceCardsBlockSchema,
  imageGalleryBlockSchema,
  ctaBlockSchema,
])
export type PageBlock = z.infer<typeof pageBlockSchema>
export type PageBlockType = PageBlock['type']

export const PAGE_BLOCK_TYPES: PageBlockType[] = [
  'hero',
  'richText',
  'stats',
  'processSteps',
  'experienceTimeline',
  'servicesGrid',
  'featuredProjects',
  'workProjectShowcase',
  'featuredCaseStudies',
  'testimonials',
  'faq',
  'resourceCards',
  'imageGallery',
  'cta',
]
