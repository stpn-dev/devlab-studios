-- Seeds the certifications table (created empty in migration 0004) with the
-- 4 real automation-platform certificates provided by Stephen. All 4 have
-- bundled badge images in src/assets/certificates/, matched by id in
-- src/lib/content/profile.ts's static badge map, since these are
-- build-time asset imports, not R2-hosted URLs D1 can store directly.
INSERT INTO certifications (id, name, issuer, issued_date, credential_url, badge_image_url, sort_order, status, created_at, updated_at)
VALUES
  ('cert-zapier-no-code-automation', 'No Code Automation with Zapier', 'Technical Virtual Assistants PH', '2025-11-25', NULL, NULL, 10, 'published', datetime('now'), datetime('now')),
  ('cert-make-no-code-automation', 'No Code Automation with Make.com', 'Technical Virtual Assistants PH', '2025-12-02', NULL, NULL, 20, 'published', datetime('now'), datetime('now')),
  ('cert-n8n-ai-automation', 'AI Automation with n8n', 'Technical Virtual Assistants PH', '2025-12-16', NULL, NULL, 30, 'published', datetime('now'), datetime('now')),
  ('cert-highlevel-crm', 'HighLevel CRM', 'Tara AI Community+', '2026-06-24', NULL, NULL, 40, 'published', datetime('now'), datetime('now'));
