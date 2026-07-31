import { testimonialSchema, certificationSchema, redirectSchema, caseStudySchema, projectSchema } from '../lib/schemas/collections.js'
import { listTestimonials, replaceTestimonials } from './repositories/testimonials.js'
import { listCertifications, replaceCertifications } from './repositories/certifications.js'
import { listRedirects, upsertRedirect, deleteRedirect } from './repositories/redirects.js'
import { listCaseStudies, upsertCaseStudy, deleteCaseStudy } from './repositories/caseStudies.js'
import { listProjects, upsertProject, deleteProject } from './repositories/projects.js'
import {
  getProfileContent,
  getResourcesContent,
  getSeoContent,
  getServicesContent,
  getSiteSettingsContent,
  replaceProfileContent,
  replaceResourcesContent,
  replaceSeoContent,
  replaceServicesContent,
  replaceSiteSettingsContent,
} from './repositories/content.js'

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
  /**
   * Registered here (in addition to ProjectsManager's own dedicated
   * /api/admin/projects routes) purely so rollback.ts's existing
   * getPerItemCollection() branch can restore a project snapshot without
   * a third code path — ProjectsManager never calls /api/admin/collections/projects.
   */
  projects: {
    label: 'Projects',
    schema: projectSchema,
    list: (db) => listProjects(db, { includeDrafts: true }),
    upsert: (db, payload) => upsertProject(db, payload),
    delete: (db, id) => deleteProject(db, id),
  },
}

/**
 * Singleton content blobs edited as one whole object (services, resources,
 * profile, site-settings, seo) — pre-dates the schema-driven collections
 * above and keeps its own bespoke admin UI (see src/components/admin/),
 * but shares the same version/audit-log plumbing via content/[type].ts
 * and versions/[type]/rollback.ts.
 */
export const SINGLETON_CONTENT_TYPES = {
  services: { label: 'Services', get: getServicesContent, replace: replaceServicesContent },
  resources: { label: 'Resources', get: getResourcesContent, replace: replaceResourcesContent },
  profile: { label: 'Profile', get: getProfileContent, replace: replaceProfileContent },
  'site-settings': { label: 'Site Settings', get: getSiteSettingsContent, replace: replaceSiteSettingsContent },
  seo: { label: 'SEO', get: getSeoContent, replace: replaceSeoContent },
}

export function getReplaceAllCollection(type) {
  return REPLACE_ALL_COLLECTIONS[type] || null
}

export function getPerItemCollection(type) {
  return PER_ITEM_COLLECTIONS[type] || null
}

export function getSingletonContentType(type) {
  return SINGLETON_CONTENT_TYPES[type] || null
}
