import { testimonialSchema, certificationSchema, redirectSchema, caseStudySchema } from '../lib/schemas/collections.js'
import { listTestimonials, replaceTestimonials } from './repositories/testimonials.js'
import { listCertifications, replaceCertifications } from './repositories/certifications.js'
import { listRedirects, upsertRedirect, deleteRedirect } from './repositories/redirects.js'
import { listCaseStudies, upsertCaseStudy, deleteCaseStudy } from './repositories/caseStudies.js'

/**
 * Collections edited as one whole array at a time (delete-all-then-reinsert
 * on save) — matches how their repositories are already built. No
 * per-item id-keyed endpoint exists for these.
 */
export const REPLACE_ALL_COLLECTIONS = {
  testimonials: {
    label: 'Testimonials',
    schema: testimonialSchema,
    list: (db) => listTestimonials(db, { includeDrafts: true }),
    replaceAll: (db, items) => replaceTestimonials(db, items),
  },
  certifications: {
    label: 'Certifications',
    schema: certificationSchema,
    list: (db) => listCertifications(db, { includeDrafts: true }),
    replaceAll: (db, items) => replaceCertifications(db, items),
  },
}

/** Collections with real per-item CRUD (create/update via upsert-by-id, delete-by-id). */
export const PER_ITEM_COLLECTIONS = {
  redirects: {
    label: 'Redirects',
    schema: redirectSchema,
    list: (db) => listRedirects(db),
    upsert: (db, payload) => upsertRedirect(db, payload),
    delete: (db, id) => deleteRedirect(db, id),
  },
  'case-studies': {
    label: 'Case Studies',
    schema: caseStudySchema,
    list: (db) => listCaseStudies(db, { includeDrafts: true }),
    upsert: (db, payload) => upsertCaseStudy(db, payload),
    delete: (db, id) => deleteCaseStudy(db, id),
  },
}

export function getReplaceAllCollection(type) {
  return REPLACE_ALL_COLLECTIONS[type] || null
}

export function getPerItemCollection(type) {
  return PER_ITEM_COLLECTIONS[type] || null
}
