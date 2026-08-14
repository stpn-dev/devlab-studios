-- Targeted, idempotent canonical tagline alignment.
-- Apply to Preview first; this does not replace or reseed any CMS content.

UPDATE site_settings
SET value_json = json_set(
  value_json,
  '$.tagline', 'Your Vision, Digitally Crafted — one solution at a time, always evolving.'
), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'site_footer';
