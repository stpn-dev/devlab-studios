-- Targeted, idempotent correction only. Safe for existing databases: only
-- touches the contact-page CTA body if it still carries the stale Zoho
-- wording seeded by 2026-08-14-admin-public-section-alignment.sql — an
-- admin's own edit to this field is left untouched.
UPDATE page_sections
SET content_json = json_set(content_json, '$.body', 'Responses are delivered securely by email.'),
    updated_at = datetime('now')
WHERE page_id = (SELECT id FROM pages WHERE slug = 'contact')
  AND section_key = 'submit'
  AND json_extract(content_json, '$.body') = 'Responses are securely routed via Zoho.';
