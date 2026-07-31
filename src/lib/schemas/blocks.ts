import { z } from 'zod'

/**
 * The constrained set of page-composition blocks approved for use on
 * block-composed singleton pages (Home, About, Process). Editors can
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

const featuredCaseStudiesBlockSchema = z.object({
  type: z.literal('featuredCaseStudies'),
  props: z.object({
    heading: z.string().optional().default(''),
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
  'featuredCaseStudies',
  'testimonials',
  'faq',
  'resourceCards',
  'imageGallery',
  'cta',
]
