-- Business-first content migration for an EXISTING database (Preview first,
-- then Production). Targeted and idempotent: it never touches Projects, Work
-- items, Articles, Certifications, Media, or any lead data.
--
-- Why the Home page is replaced wholesale while every other page is patched
-- row by row: the Home block COMPOSITION genuinely changed. The old page had
-- `stats` holding capability copy and `richText` holding an architecture note;
-- the new page reads `stats` as reliability principles and the first
-- `richText` as founder credibility. Leaving the old rows in place would not
-- be "preserving editor content" — it would render capability copy under a
-- heading about reliability. There is no field-by-field mapping that is
-- honest, so Home is rebuilt.
--
-- RECOVERY: step 1 writes the current Home composition into `content_versions`
-- as an append-only snapshot before anything is deleted, so the previous state
-- is recoverable from the database itself rather than from a deploy artifact.
--
-- Everything else (navigation, CTAs, SEO, Services/Insights/Contact/Work copy)
-- is a scoped UPDATE of named rows.

-- ---------------------------------------------------------------------------
-- 1. Snapshot the current Home composition before replacing it.
-- ---------------------------------------------------------------------------
INSERT INTO content_versions (id, content_type, content_id, version_number, status, snapshot_json, created_by, created_at)
SELECT
  -- A random suffix, not a timestamp: re-running this script within the same
  -- second would otherwise collide on the primary key and abort the whole run.
  'home-pre-business-first-' || strftime('%Y%m%d%H%M%S', 'now') || '-' || lower(hex(randomblob(4))),
  'pages',
  'home',
  COALESCE((SELECT MAX(version_number) FROM content_versions WHERE content_type = 'pages' AND content_id = 'home'), 0) + 1,
  'published',
  (
    SELECT json_group_array(json_object(
      'id', id,
      'section_key', section_key,
      'section_type', section_type,
      'title', title,
      'content_json', content_json,
      'sort_order', sort_order,
      'status', status
    ))
    FROM page_sections
    WHERE page_id = (SELECT id FROM pages WHERE slug = 'home')
  ),
  'migration:2026-09-17-business-first-content',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM page_sections WHERE page_id = (SELECT id FROM pages WHERE slug = 'home'));

-- ---------------------------------------------------------------------------
-- 2. Rebuild the Home page composition.
-- ---------------------------------------------------------------------------
INSERT INTO pages (id, slug, title, status, created_at, updated_at)
VALUES ('page-home', 'home', 'Home', 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(slug) DO UPDATE SET status = 'published', updated_at = excluded.updated_at;

DELETE FROM page_sections WHERE page_id = (SELECT id FROM pages WHERE slug = 'home');

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-hero', id, 'hero', 'hero', 'Hero',
  '{"kicker":"Software and automation studio","heading":"Build the systems your business needs to capture opportunities and operate reliably.","subheading":"DevLab Studios designs and connects conversion websites, backend services, structured data, CRM workflows, and AI automation into maintainable business systems.","variant":"system","iconMotif":"fullstack","primaryCta":{"label":"Discuss Your System","href":"/contact?type=business_system"},"secondaryCta":{"label":"View Our Work","href":"/work"},"capabilities":[{"label":"01 / Capture","value":"Intake and follow-up that never drops an inquiry"},{"label":"02 / Operate","value":"Automation with visible failures and real owners"},{"label":"03 / Build","value":"Interfaces, APIs, and data that outlive the first release"}],"statusLabel":"System online"}',
  10, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-problems', id, 'problems', 'problemList', 'Problems',
  '{"heading":"The problems these systems are built to remove","subheading":"These are the failure modes that cost a business opportunities quietly, without anything obviously breaking.","items":[{"title":"Leads wait too long for a reply","description":"An inquiry arrives outside working hours, or lands in an inbox nobody owns, and the first response happens whenever someone notices.","icon":"Timer"},{"title":"Follow-up depends on someone remembering","description":"There is no record of what stage a conversation reached, so the next step happens only if the right person recalls it.","icon":"RefreshCw"},{"title":"Customer data is spread across disconnected tools","description":"The same contact exists in an inbox, a spreadsheet, a form provider, and a CRM, and none of them agree.","icon":"Database"},{"title":"The same details get typed in more than once","description":"Information already captured at intake is re-entered by hand further down the process.","icon":"ClipboardList"},{"title":"Nobody owns the step between two tools","description":"Work reaches the boundary between two systems and stops there, because the handoff was never assigned to anyone.","icon":"GitBranch"},{"title":"Automations fail without telling anyone","description":"A workflow stops running and the first sign of it is a customer asking why they never heard back.","icon":"AlertTriangle"},{"title":"A website captures inquiries with no operational handoff","description":"The form works, the email sends, and after that the inquiry has no status, no owner, and no record.","icon":"Inbox"}]}',
  20, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-solutions', id, 'solutions', 'servicesGrid', 'Solution categories',
  '{"heading":"Four ways that gets solved","subheading":"Each one is a complete system — the interface, the logic, the data, the integrations, and the handoff to a person.","serviceIds":[]}',
  30, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-proof', id, 'proof', 'workProjectShowcase', 'Featured proof',
  '{"heading":"Systems already running","subheading":"Each write-up describes the problem, the system designed for it, and what the system verifiably does — not what it is claimed to have earned.","items":[]}',
  40, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-approach', id, 'approach', 'processSteps', 'Delivery approach',
  '{"heading":"How delivery works","subheading":"Four phases: understand the workflow, agree the system, build it in stages, and hand it over so the team can run it.","steps":[{"title":"Map the workflow","description":"Walk the current process end to end: where it stalls, where ownership is unclear, what the data actually does, and which integrations already exist.","icon":"Search","outcomes":["Current workflow review","Bottleneck and handoff mapping","Priority opportunities"]},{"title":"Agree the system","description":"A written recommendation: the system structure, the tools, the delivery phases, and what will be true once it works — before any build starts.","icon":"Lightbulb","outcomes":["Recommended architecture","Scope and delivery phases","Defined success criteria"]},{"title":"Build in phases","description":"Implementation in controlled phases across interface, integration, data, and automation, with each layer tested before the next depends on it.","icon":"Settings","outcomes":["Phased implementation","Connected integrations and data flow","Validation for reliability"]},{"title":"Hand it over","description":"Deployment, a walkthrough, documentation, and the failure paths written down — so the system can be operated by the team, not only by whoever built it.","icon":"CheckCircle2","outcomes":["Launch-ready delivery","Documentation and walkthrough","Known failure paths and owners"]}]}',
  50, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-principles', id, 'principles', 'stats', 'Reliability principles',
  '{"heading":"What \"reliable\" has to mean before a system ships","subheading":"These are not aspirations. They are the rules this studio builds to — including on this website, whose own inquiry pipeline works exactly this way.","items":[{"label":"Persist before you deliver","value":"A submission is written to the database before any email, CRM, or webhook call is attempted, so an outage leaves it undelivered rather than lost."},{"label":"Failures are visible, not silent","value":"Every delivery attempt is recorded with its outcome and whether retrying it can help, so a broken integration surfaces to an operator instead of to a customer."},{"label":"Deterministic rules own routing","value":"AI summarizes and drafts; sequence, permissions, and delivery are decided by rules that can be read, tested, and explained."},{"label":"Every workflow ends at a person","value":"Anything ambiguous or high-impact routes to a human reviewer rather than being auto-resolved."}]}',
  60, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-lead-magnet', id, 'lead-magnet', 'leadMagnet', 'Lead magnet',
  '{"eyebrow":"Free resource","heading":"The Lead Intake and Follow-up Systems Checklist","body":"The checks we run on a lead intake and follow-up system before calling it reliable: capture, qualification, routing, delivery confirmation, failure visibility, and human handoff.","offerId":"lead-intake-checklist","bullets":[]}',
  70, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-founder', id, 'founder', 'richText', 'Founder credibility',
  '{"eyebrow":"Who builds it","heading":"One engineer accountable for the whole system","body":"Stephen Rey Agustinez designs and builds the technical systems delivered through DevLab Studios — from customer-facing interfaces and backend services to APIs, databases, AI workflows, and operational automation. Nothing is handed to a subcontractor who was not in the original conversation.","highlights":[]}',
  80, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-faq', id, 'faq', 'faq', 'FAQ',
  '{"heading":"Questions people ask first","subheading":"","context":"home","items":[{"question":"Do you only build automations?","answer":"No. Automation is one layer. The same engagements regularly include a conversion website, backend services, an API, a data model, dashboards, or an internal tool — whichever the workflow actually needs."},{"question":"Can you work with the tools we already use?","answer":"Yes. Systems are built around the CRM, forms, spreadsheets, inbox, and task tools already in place, using n8n, Make, Zapier, or direct API integration depending on what stays maintainable."},{"question":"What happens if an integration goes down?","answer":"Submissions are stored before any external delivery is attempted, every delivery attempt is recorded, and failed attempts stay visible to an administrator who can retry them. An outage leaves work undelivered, not lost."},{"question":"How does a project start?","answer":"With a workflow review. The goal is to understand the business problem, map the current process, and define the smallest reliable system that solves it before any build work begins."},{"question":"Who does the work?","answer":"Stephen Rey Agustinez, the founder, designs and implements the systems delivered through DevLab Studios. The Founder Profile lists the full technical background."}]}',
  90, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT 'home-cta', id, 'cta', 'cta', 'Final CTA',
  '{"eyebrow":"Next step","heading":"Start with the workflow that loses the most time.","body":"Describe what is slowing down, and you will get a straight answer about whether the right first move is a website, an automation, an integration, an internal tool, or a backend service.","primaryCta":{"label":"Discuss Your System","href":"/contact?type=business_system"},"secondaryCta":{"label":"See the solutions","href":"/services"},"inquiryType":"business_system","formId":"home-final-cta","offerId":"","solutionId":""}',
  100, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pages WHERE slug = 'home';

-- ---------------------------------------------------------------------------
-- 3. Navigation: business-first order and labels.
--    The /services ROUTE is deliberately unchanged — only the label moves to
--    "Solutions", so no redirect and no loss of accumulated search signal.
-- ---------------------------------------------------------------------------
INSERT INTO navigation_items (id, label, href, sort_order, status, created_at, updated_at)
VALUES ('nav-home', 'Home', '/', 10, 'published', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(id) DO UPDATE SET label = excluded.label, href = excluded.href, sort_order = excluded.sort_order, status = excluded.status, updated_at = excluded.updated_at;

UPDATE navigation_items SET label = 'Solutions', href = '/services', sort_order = 20, status = 'published', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'nav-services';
UPDATE navigation_items SET label = 'Work',      href = '/work',     sort_order = 30, status = 'published', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'nav-work';
UPDATE navigation_items SET label = 'Insights',  href = '/insights', sort_order = 40, status = 'published', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'nav-resources';
UPDATE navigation_items SET label = 'About',     href = '/about',    sort_order = 50, status = 'published', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'nav-about';
UPDATE navigation_items SET label = 'Profile',   href = '/profile',  sort_order = 60, status = 'published', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'nav-profile';

-- ---------------------------------------------------------------------------
-- 4. Header CTA and footer links.
-- ---------------------------------------------------------------------------
INSERT INTO site_settings (key, value_json, updated_at)
VALUES ('site_ctas', '{"navbarContactLabel":"Discuss Your System","mobileContactLabel":"Discuss Your System"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;

UPDATE site_settings
SET value_json = json_set(
      value_json,
      '$.quickLinks',
      json('[{"label":"Home","href":"/"},{"label":"Solutions","href":"/services"},{"label":"Work","href":"/work"},{"label":"Insights","href":"/insights"},{"label":"About","href":"/about"},{"label":"Founder Profile","href":"/profile"},{"label":"Contact","href":"/contact"}]')
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE key = 'site_footer';

-- ---------------------------------------------------------------------------
-- 5. Solutions page copy (route unchanged).
-- ---------------------------------------------------------------------------
UPDATE page_sections SET content_json = '{"eyebrow":"Solutions","heading":"Four ways a business system gets built here.","subheading":"Each one covers the whole path: what the customer sees, what happens behind it, where the data lives, which tools it connects, and who picks it up when a person is needed.","variant":"editorial","iconMotif":"automation","signals":[]}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'services-hero';
UPDATE page_sections SET content_json = '{"heading":"Solution categories","body":"Every capability listed below maps to work already delivered. The related projects under each category are real builds, not illustrative examples."}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'services-overview';
UPDATE page_sections SET content_json = '{"eyebrow":"Not sure where to start?","heading":"Start with the workflow that loses the most time or opportunities.","body":"A short workflow review is enough to tell whether the right first move is a website, an automation, an AI-assisted step, an internal tool, or a backend integration.","primaryCta":{"label":"Request a Workflow Audit","href":"/contact?type=workflow_audit"},"secondaryCta":{"label":"Read Insights","href":"/insights"},"inquiryType":"workflow_audit","formId":"solutions-final-cta","offerId":"workflow-systems-audit","solutionId":"workflow-systems-audit"}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'services-cta';
UPDATE page_sections SET content_json = '{"heading":"FAQ","subheading":"Common questions about how these engagements work.","context":"services","items":[]}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'services-faq-copy';

-- ---------------------------------------------------------------------------
-- 6. Work page copy. The showcase ITEMS are editor-owned and left untouched.
--
-- Matched by (page, section_type) rather than by id. `replacePage()` reinserts
-- every section with a fresh crypto.randomUUID() whenever a page is saved in
-- the admin, so the bootstrap ids ('work-hero' and friends) survive only until
-- the first CMS edit. Matching on id here silently updated zero rows in
-- production -- see 2026-09-17-work-page-copy-fix.sql.
-- ---------------------------------------------------------------------------
UPDATE page_sections SET content_json = json_set(
    content_json,
    '$.heading', 'Business systems, with the decisions, data flow, and handoff explained.',
    '$.subheading', 'Each write-up states the business problem, the system designed for it, and what that system verifiably does. Where a client result is not something we can evidence, it is not claimed.',
    '$.primaryCta.label', 'Explore Selected Systems',
    '$.primaryCta.href', '#selected-systems',
    '$.secondaryCta.label', 'Discuss Your System',
    '$.secondaryCta.href', '/contact?type=business_system'
  ), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE section_type = 'hero' AND page_id = (SELECT id FROM pages WHERE slug = 'work');

UPDATE page_sections SET content_json = json_set(
    content_json,
    '$.heading', 'Selected systems',
    '$.subheading', 'A closer look at how each one moves from trigger to verified operational handoff.'
  ), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE section_type = 'workProjectShowcase' AND page_id = (SELECT id FROM pages WHERE slug = 'work');

UPDATE page_sections SET content_json = json_set(
    content_json,
    '$.primaryCta.label', 'Discuss Your System',
    '$.primaryCta.href', '/contact?type=business_system'
  ), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE section_type = 'cta' AND page_id = (SELECT id FROM pages WHERE slug = 'work');

-- ---------------------------------------------------------------------------
-- 7. Insights and Contact CTA copy.
-- ---------------------------------------------------------------------------
UPDATE page_sections SET content_json = '{"eyebrow":"Need implementation?","heading":"Turn the article into a working system.","body":"DevLab Studios can map the process, choose the stack, and build the website, automation, or internal workflow around your current tools.","primaryCta":{"label":"Discuss Your System","href":"/contact?type=business_system"},"secondaryCta":{"label":"View Solutions","href":"/services"},"inquiryType":"business_system","formId":"insights-final-cta","offerId":"","solutionId":""}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'insights-cta';

UPDATE page_sections SET content_json = '{"eyebrow":"Start a conversation","heading":"Tell us where the workflow slows down.","subheading":"Describe the interface, integration, data, or automation problem. You will get a reply with the clearest next step for the whole system.","variant":"compact","iconMotif":"automation","signals":[]}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 'contact-hero';

-- The contact form's fields, labels, validation, and routing are application
-- code now (src/components/islands/InquiryForm.jsx + /api/inquiries), not CMS
-- content. These two rows described the old four-field form and no longer
-- drive anything, so they are unpublished rather than deleted — nothing is
-- lost, and they stop appearing as editable-but-inert content in Admin.
UPDATE page_sections SET status = 'draft', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id IN ('contact-fields', 'contact-submit');

-- ---------------------------------------------------------------------------
-- 8. SEO metadata: business intent on the business pages, individual
--    capability intent on the Founder Profile, so the two stop competing.
-- ---------------------------------------------------------------------------
UPDATE seo_metadata SET
  meta_title = 'DevLab Studios - Software & Automation Systems for Businesses',
  meta_description = 'DevLab Studios builds reliable software and automation systems for businesses: conversion websites, lead intake and follow-up, CRM workflows, backend services, APIs, and AI automation.',
  meta_keywords = 'business automation systems, lead intake automation, workflow automation, CRM integration, custom business software, AI automation for business, backend integration, internal tools, DevLab Studios',
  og_title = 'DevLab Studios - Software & Automation Systems for Businesses',
  og_description = 'Conversion websites, backend services, structured data, CRM workflows, and AI automation connected into maintainable business systems.',
  twitter_title = 'DevLab Studios - Software & Automation Systems for Businesses',
  twitter_description = 'Lead intake and follow-up, workflow and AI automation, and custom operations software built to stay maintainable.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'home';

UPDATE seo_metadata SET
  meta_title = 'Solutions - Lead Intake, Workflow Automation & Custom Software | DevLab Studios',
  meta_description = 'Four solution areas: lead intake and follow-up systems, workflow and AI automation, custom software and operations systems, and a workflow systems audit.',
  meta_keywords = 'lead intake system, lead follow-up automation, workflow automation, AI automation, n8n, Make, Zapier, CRM integration, custom business software, internal tools, workflow audit',
  og_title = 'Solutions - Lead Intake, Workflow Automation & Custom Software',
  og_description = 'Complete systems: the interface, the logic, the data, the integrations, and the handoff to a person.',
  og_image = 'https://www.devlabstudios.com/og.png',
  twitter_title = 'Solutions - DevLab Studios',
  twitter_description = 'Lead intake and follow-up, workflow and AI automation, custom operations software, and workflow audits.',
  twitter_image = 'https://www.devlabstudios.com/og.png',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'services';

UPDATE seo_metadata SET
  meta_title = 'Stephen Rey Agustinez - Full-Stack Developer & AI Automation Architect',
  meta_description = 'Founder profile: full-stack development with React, Astro, Java, Spring Boot and Laravel; backend services, REST APIs and SQL data models; AI automation architecture with n8n, Make and Zapier. Open to remote employment, contract, and collaboration.',
  meta_keywords = 'Stephen Rey Agustinez, full-stack developer, backend engineer, Java developer, Spring Boot developer, Laravel developer, React developer, REST API developer, SQL, AI automation architect, n8n, Make.com, Zapier, remote developer',
  og_title = 'Stephen Rey Agustinez - Full-Stack Developer & AI Automation Architect',
  og_description = 'Experience, certifications, technical skills, and selected projects. Open to remote employment, contract, and technical collaboration.',
  twitter_title = 'Stephen Rey Agustinez - Full-Stack Developer & AI Automation Architect',
  twitter_description = 'Founder of DevLab Studios. Full-stack, backend, API, SQL, and AI automation experience, with selected technical projects.',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'profile';

UPDATE seo_metadata SET
  meta_title = 'Discuss Your System - Contact DevLab Studios',
  meta_description = 'Start a business inquiry about lead intake, workflow or AI automation, a custom operations system, or a workflow audit. Employment and collaboration inquiries have their own short form.',
  meta_keywords = 'business automation inquiry, workflow audit request, custom software inquiry, CRM integration consultation, DevLab Studios contact',
  og_title = 'Discuss Your System - Contact DevLab Studios',
  og_description = 'Describe the workflow that is slowing down and get a straight answer about the right first move.',
  og_image = 'https://www.devlabstudios.com/og.png',
  twitter_title = 'Discuss Your System - Contact DevLab Studios',
  twitter_description = 'Business system inquiries, plus a separate short form for employment and collaboration.',
  twitter_image = 'https://www.devlabstudios.com/og.png',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'contact';

UPDATE seo_metadata SET
  meta_title = 'Insights - AI, Automation & Web Systems Notes | DevLab Studios',
  og_title = 'Insights - AI, Automation & Web Systems Notes | DevLab Studios',
  twitter_title = 'Insights - AI, Automation & Web Systems Notes',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE page_slug = 'insights';

-- Work had no SEO row at all, so it fell back to the page's own <title> with
-- no description and no canonical.
INSERT INTO seo_metadata (id, page_slug, meta_title, meta_description, meta_keywords, canonical_url, og_title, og_description, og_image, twitter_title, twitter_description, twitter_image, created_at, updated_at)
VALUES (
  'seo-work',
  'work',
  'Work - Business Systems Already Running | DevLab Studios',
  'Selected systems with the business problem, the architecture designed for it, and what the system verifiably does in operation. No invented metrics.',
  'automation case studies, workflow automation examples, lead intake system examples, CRM integration examples, custom business software examples',
  'https://www.devlabstudios.com/work',
  'Work - Business Systems Already Running | DevLab Studios',
  'The problem, the system designed for it, and what it does in operation - for each selected project.',
  'https://www.devlabstudios.com/og.png',
  'Work - DevLab Studios',
  'Selected business systems, with architecture and operating behavior explained.',
  'https://www.devlabstudios.com/og.png',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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

-- ---------------------------------------------------------------------------
-- 9. The Insights article that backs the lead magnet must be published for the
--    offer page's "read it on the site" link to resolve. This only publishes an
--    existing draft; it never creates content.
-- ---------------------------------------------------------------------------
UPDATE articles
SET status = 'published', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE slug = 'lead-intake-automation-checklist' AND status = 'draft';
