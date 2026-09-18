-- Renames the public Solutions route from /services to /solutions, and repairs
-- the SEO records that had silently stopped controlling anything.
--
-- Targeted and idempotent: every statement matches on a stable value and can be
-- re-run without changing the result. Nothing here deletes content.
--
-- BACKGROUND
--
-- The nav label, page heading, breadcrumb, schema.org entries and the CMS SEO
-- record all said "Solutions" while the route said "/services". The SEO record
-- even carried `canonical_url = https://www.devlabstudios.com/solutions`, a URL
-- that returned 404. Meanwhile `services.astro` looked its SEO up under the
-- slug 'services', found no row, and silently fell back to the static file — so
-- every edit made on the admin's SEO screen for that page was discarded. The
-- Insights row had the same problem for a different reason: its slug was
-- misspelled 'insigths'.
--
-- The application now serves /solutions and 301s /services to it
-- (PERMANENT_PATH_REDIRECTS in src/middleware.ts).
--
-- NOT CHANGED, deliberately: `faqs.page_slug = 'services'` and the
-- '/admin/content/services' content type. Those are internal content-type keys
-- for the Service Catalog, not URLs. Public routes moved; keys did not.

-- 1. The CMS page record behind /solutions.
UPDATE pages
SET slug = 'solutions',
    title = 'Solutions',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE slug = 'services';

-- 2. Navigation and footer links.
UPDATE navigation_items
SET href = '/solutions',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE href = '/services';

UPDATE site_settings
SET value_json = replace(value_json, '"href":"/services"', '"href":"/solutions"'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE value_json LIKE '%"href":"/services"%';

-- 3. Calls to action embedded in page block props.
UPDATE page_sections
SET content_json = replace(content_json, '"href":"/services"', '"href":"/solutions"'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE content_json LIKE '%"href":"/services"%';

-- Anchored links into the four solution categories, e.g. /services#lead-intake.
UPDATE page_sections
SET content_json = replace(content_json, '"href":"/services#', '"href":"/solutions#'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE content_json LIKE '%"href":"/services#%';

-- 4. The misspelled Insights SEO slug. Until now `loadPageSeo('insights')`
--    matched nothing and fell through to the static fallback, so this record
--    was inert.
UPDATE seo_metadata
SET page_slug = 'insights',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'insigths';

-- 4b. Preview and production had DIFFERENT slugs for this record: production
--     was edited to 'solutions' through the CMS, preview still carried
--     'services'. Rename it only when there is no 'solutions' row to collide
--     with, so re-running this against either environment is safe.
UPDATE seo_metadata
SET page_slug = 'solutions',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'services'
  AND NOT EXISTS (SELECT 1 FROM seo_metadata other WHERE other.page_slug = 'solutions');

-- 5. The Solutions record is already keyed 'solutions' and already points at
--    /solutions — correct as of this migration rather than by accident. Retitle
--    it to match the label visitors actually see.
UPDATE seo_metadata
SET meta_title = 'Solutions - Lead Intake, Workflow Automation & Custom Software | DevLab Studios',
    og_title = 'Solutions - Lead Intake, Workflow Automation & Custom Software',
    twitter_title = 'Solutions - DevLab Studios',
    canonical_url = 'https://www.devlabstudios.com/solutions',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'solutions';

-- 6. Public routes that never had an SEO record at all, so the admin screen
--    could not reach them. INSERT OR IGNORE keeps this re-runnable and never
--    overwrites anything an editor has since changed.
INSERT OR IGNORE INTO seo_metadata (
  id, page_slug, meta_title, meta_description, meta_keywords, canonical_url,
  og_title, og_description, og_image, twitter_title, twitter_description, twitter_image,
  created_at, updated_at
) VALUES
  (
    'seo-process', 'process',
    'Delivery Process - How a Build Runs | DevLab Studios',
    'How a DevLab Studios engagement runs from first conversation to a working system: discovery, design, build, handover, and support.',
    'delivery process, software delivery, project phases, handover, DevLab Studios',
    'https://www.devlabstudios.com/process',
    'Delivery Process - How a Build Runs',
    'Discovery, design, build, handover, support - what each phase produces and who is involved.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    'Delivery Process - DevLab Studios',
    'What each phase of a build produces, and who is involved.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'seo-insights-daily', 'insights/daily',
    'AI & Automation Daily - DevLab Studios',
    'A short daily log of AI automation and AI advancement stories worth reading, summarized and linked to the original source.',
    'AI news, AI automation news, daily AI digest, workflow automation news',
    'https://www.devlabstudios.com/insights/daily',
    'AI & Automation Daily',
    'A short daily pass over AI automation and AI advancement news, linked back to each publisher.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    'AI & Automation Daily - DevLab Studios',
    'A short daily pass over AI automation and AI advancement news.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'seo-privacy', 'privacy',
    'Privacy Policy | DevLab Studios',
    'How DevLab Studios collects, stores, and uses the information submitted through this site.',
    'privacy policy, data handling, DevLab Studios',
    'https://www.devlabstudios.com/privacy',
    'Privacy Policy - DevLab Studios',
    'How information submitted through this site is collected, stored, and used.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    'Privacy Policy - DevLab Studios',
    'How information submitted through this site is handled.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'seo-terms', 'terms',
    'Terms of Service | DevLab Studios',
    'The terms that apply to use of the DevLab Studios website and the engagements described on it.',
    'terms of service, website terms, DevLab Studios',
    'https://www.devlabstudios.com/terms',
    'Terms of Service - DevLab Studios',
    'The terms that apply to use of this website and the engagements described on it.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    'Terms of Service - DevLab Studios',
    'The terms that apply to use of this website.',
    'https://www.devlabstudios.com/devlabstudios-logo-only.png',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  );
