-- Corrective update for the Work page copy.
--
-- WHY THIS EXISTS: 2026-09-17-business-first-content.sql targeted Work's
-- sections by the ids the original bootstrap script gave them
-- ('work-hero', 'work-showcase', 'work-cta'). Those ids are NOT stable.
-- `replacePage()` in src/worker/repositories/pages.js deletes and reinserts
-- every section with a fresh `crypto.randomUUID()` each time a page is saved
-- through the admin, so the moment anyone edited Work in the CMS its section
-- ids became UUIDs. The three UPDATEs matched zero rows and reported success,
-- leaving Work on its pre-rebuild copy while every other page moved.
--
-- Home was unaffected because it is rebuilt by page_id (DELETE + INSERT), and
-- services/insights/contact happened to still hold their bootstrap ids.
--
-- This script therefore matches on (page slug, section_type), which is stable
-- by construction: a page has exactly one hero, one showcase and one CTA.
--
-- Idempotent, and safe to run against an already-correct database.

-- Hero copy and calls to action.
UPDATE page_sections
SET content_json = json_set(
      content_json,
      '$.heading', 'Business systems, with the decisions, data flow, and handoff explained.',
      '$.subheading', 'Each write-up states the business problem, the system designed for it, and what that system verifiably does. Where a client result is not something we can evidence, it is not claimed.',
      '$.primaryCta.label', 'Explore Selected Systems',
      '$.primaryCta.href', '#selected-systems',
      '$.secondaryCta.label', 'Discuss Your System',
      '$.secondaryCta.href', '/contact?type=business_system'
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE section_type = 'hero'
  AND page_id = (SELECT id FROM pages WHERE slug = 'work');

-- Showcase heading only. The `items` array is editor-owned and must survive
-- untouched, which is why this is a json_set of two keys and not a rewrite.
UPDATE page_sections
SET content_json = json_set(
      content_json,
      '$.heading', 'Selected systems',
      '$.subheading', 'A closer look at how each one moves from trigger to verified operational handoff.'
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE section_type = 'workProjectShowcase'
  AND page_id = (SELECT id FROM pages WHERE slug = 'work');

-- Final call to action.
UPDATE page_sections
SET content_json = json_set(
      content_json,
      '$.primaryCta.label', 'Discuss Your System',
      '$.primaryCta.href', '/contact?type=business_system'
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE section_type = 'cta'
  AND page_id = (SELECT id FROM pages WHERE slug = 'work');
