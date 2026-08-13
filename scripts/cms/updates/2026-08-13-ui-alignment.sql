-- Targeted, idempotent content alignment for the cinematic UI refresh.
-- Apply to preview first. This intentionally avoids the destructive full seed.

DELETE FROM navigation_items WHERE id = 'nav-process';
INSERT INTO navigation_items (id, label, href, sort_order, status, created_at, updated_at) VALUES
  ('nav-about', 'About', '/about', 10, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('nav-services', 'Services', '/services', 20, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('nav-work', 'Work', '/work', 30, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('nav-resources', 'Insights', '/insights', 40, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('nav-profile', 'Profile', '/profile', 50, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(id) DO UPDATE SET label = excluded.label, href = excluded.href, sort_order = excluded.sort_order, status = excluded.status, updated_at = excluded.updated_at;

INSERT INTO pages (id, slug, title, status, created_at, updated_at) VALUES
  ('page-home', 'home', 'Home', 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('page-about', 'about', 'About', 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(slug) DO UPDATE SET title = excluded.title, status = excluded.status, updated_at = excluded.updated_at;

INSERT INTO site_settings (key, value_json, updated_at)
VALUES ('site_ctas', '{"navbarContactLabel":"Start a Project","mobileContactLabel":"Start a Project"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'ui-home-hero', id, 'hero', 'hero', 'Home hero', '{"eyebrow":"Full-Stack Developer & AI Automation Specialist","heading":"From first click to final handoff, build the whole system to move.","subheading":"DevLab Studios connects polished web experiences, dependable APIs, structured data, and AI-powered automation into one clear operating flow.","variant":"system","iconMotif":"fullstack","signals":["React + Astro","Java + Laravel","n8n + Make"],"primaryCta":{"label":"Start a Project","href":"/contact"},"secondaryCta":{"label":"View Profile","href":"/profile"}}', 10, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home'
ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json, status = excluded.status, updated_at = excluded.updated_at;

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'ui-about-hero', id, 'hero', 'hero', 'About hero', '{"eyebrow":"Founded March 2, 2026","heading":"Systems for clearer offers, faster operations, and cleaner handoffs.","subheading":"DevLab Studios helps businesses turn messy workflows into complete digital systems—customer-facing interfaces, dependable services, structured data, and automation that keeps work moving.","variant":"editorial","iconMotif":"fullstack","signals":[],"primaryCta":{"label":"View Services","href":"/services"},"secondaryCta":{"label":"Founder Profile","href":"/profile"}}', 10, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'about'
ON CONFLICT(id) DO UPDATE SET content_json = excluded.content_json, status = excluded.status, updated_at = excluded.updated_at;

UPDATE site_settings
SET value_json = json_set(
  value_json,
  '$.role', 'Full-Stack Developer & AI Automation Specialist',
  '$.resumeLink', '/resume.pdf',
  '$.about', 'Full-stack developer and AI automation specialist building end-to-end systems across React and Astro interfaces, Java and Laravel services, REST APIs, SQL-backed data flows, n8n workflows, and AI agents. I connect every layer from customer experience to operational handoff so systems remain useful, reliable, and maintainable.'
), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'profile_about';

INSERT INTO seo_metadata (
  id, page_slug, meta_title, meta_description, meta_keywords, canonical_url,
  og_title, og_description, og_image, twitter_title, twitter_description, twitter_image,
  created_at, updated_at
) VALUES (
  'seo-home', 'home',
  'DevLab Studios - Full-Stack Developer & AI Automation Specialist',
  'DevLab Studios by Stephen Rey Agustinez - full-stack development, conversion-focused web experiences, APIs, data systems, and AI automation for modern businesses worldwide.',
  'Stephen Agustinez, DevLab Studios, full-stack developer, AI automation specialist, workflow automation, React, Astro, Java, Laravel, APIs',
  'https://www.devlabstudios.com/',
  'DevLab Studios - Full-Stack Development & AI Automation',
  'DevLab Studios connects web interfaces, backend services, structured data, and AI automation into complete business systems.',
  'https://www.devlabstudios.com/og.png',
  'DevLab Studios - Full-Stack Development & AI Automation',
  'Complete web, backend, data, and AI automation systems for modern businesses.',
  'https://www.devlabstudios.com/og.png',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(page_slug) DO UPDATE SET
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  meta_keywords = excluded.meta_keywords,
  canonical_url = excluded.canonical_url,
  og_title = excluded.og_title,
  og_description = excluded.og_description,
  og_image = excluded.og_image,
  twitter_title = excluded.twitter_title,
  twitter_description = excluded.twitter_description,
  twitter_image = excluded.twitter_image,
  updated_at = excluded.updated_at;
