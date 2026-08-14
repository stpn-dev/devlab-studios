-- Targeted, idempotent additions only. Safe for existing databases: no rows
-- are deleted or overwritten. Existing editor changes remain authoritative.
INSERT OR IGNORE INTO pages (id, slug, title, status, created_at, updated_at) VALUES
  ('page-home', 'home', 'Home', 'published', datetime('now'), datetime('now')),
  ('page-about', 'about', 'About', 'published', datetime('now'), datetime('now')),
  ('page-services', 'services', 'Services', 'published', datetime('now'), datetime('now')),
  ('page-insights', 'insights', 'Insights', 'published', datetime('now'), datetime('now')),
  ('page-contact', 'contact', 'Contact', 'published', datetime('now'), datetime('now'));

WITH _public_section_alignment (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at) AS (VALUES
  ('home-capabilities', 'page-home', 'capabilities', 'stats', 'Capabilities', '{"heading":"One system, every layer","subheading":"Full-stack delivery across customer experience, application logic, data, and the automation that keeps work moving.","items":[{"label":"Conversion websites","value":"Landing pages and business websites built to load fast, explain the offer clearly, and move visitors toward inquiry or booking."},{"label":"Automation systems","value":"Lead routing, follow-up flows, AI-assisted responses, and operations automations across Zapier, n8n, Make, and HighLevel."},{"label":"Internal workflows","value":"CRM integrations, dashboards, trackers, forms, and structured handoff systems that reduce manual work for teams."},{"label":"Full-stack product delivery","value":"React and Astro interfaces connected to Java, Spring Boot, Laravel, REST APIs, and SQL-backed systems."}]}', 20, 'published', datetime('now'), datetime('now')),
  ('home-architecture', 'page-home', 'architecture', 'richText', 'Architecture', '{"eyebrow":"System architecture","heading":"Every layer has a purpose. Every handoff stays visible.","body":"The result is not a collection of disconnected tools. It is one maintainable operating flow with clear failure paths and ownership."}', 30, 'published', datetime('now'), datetime('now')),
  ('home-services', 'page-home', 'services', 'servicesGrid', 'Services', '{"heading":"Services Offered","subheading":"The offers below are grounded in the work already shown in the portfolio, resume history, and technical stack.","serviceIds":[]}', 40, 'published', datetime('now'), datetime('now')),
  ('home-process', 'page-home', 'process', 'processSteps', 'Process', '{"heading":"Problem To Solution Approach","subheading":"A four-phase delivery model: diagnose the problem, define the approach, build in structured phases, and deliver with full handoff support.","steps":[{"title":"Problem Audit","description":"The process begins by mapping the actual business problem, including bottlenecks, broken handoffs, slow response points, missing integrations, and unclear customer flow.","icon":"Search"},{"title":"Solution Proposal","description":"The audit produces a best-fit solution model covering system structure, scope, tools, delivery phases, and the expected business outcome.","icon":"Lightbulb"},{"title":"Solution Build-Up","description":"Implementation proceeds in structured phases so every website, automation, integration, or backend workflow is tested and connected.","icon":"Settings"},{"title":"Solution Delivery","description":"Delivery focuses on launch readiness, documentation, walkthroughs, handoff, and operational clarity.","icon":"CheckCircle2"}]}', 50, 'published', datetime('now'), datetime('now')),
  ('home-credibility', 'page-home', 'credibility', 'richText', 'Credibility', '{"eyebrow":"Why clients hire DevLab Studios","heading":"Full-stack Development + AI Automation, connected from interface to handoff.","body":"The work spans customer-facing websites, backend services, structured data, AI-assisted workflows, CRM integrations, dashboards, and internal tools—so projects move from polished experience to reliable operations without fragmented handoffs."}', 60, 'published', datetime('now'), datetime('now')),

  ('about-facts', 'page-about', 'facts', 'stats', 'Studio Facts', '{"heading":"Studio Facts","items":[{"label":"Focus","value":"Full-stack + AI automation"},{"label":"Approach","value":"Workflow-first delivery"},{"label":"Founder","value":"Stephen Rey Agustinez"},{"label":"Availability","value":"Remote-first worldwide"}]}', 20, 'published', datetime('now'), datetime('now')),
  ('about-mission', 'page-about', 'mission', 'richText', 'Mission', '{"eyebrow":"Mission","heading":"Make business systems easier to launch, connect, and operate.","body":"DevLab Studios exists to help businesses reduce operational friction with practical software. The mission is to build systems that clarify the customer journey, connect the tools behind the work, and make repeated processes easier to manage."}', 30, 'published', datetime('now'), datetime('now')),
  ('about-principles', 'page-about', 'principles', 'stats', 'Principles', '{"heading":"Principles","items":[{"label":"01","value":"Start with the real workflow before choosing tools."},{"label":"02","value":"Build small enough to ship, but structured enough to maintain."},{"label":"03","value":"Keep data flow, handoff, and reliability visible."},{"label":"04","value":"Use automation where it removes repeat work or response delays."}]}', 40, 'published', datetime('now'), datetime('now')),
  ('about-services', 'page-about', 'services', 'servicesGrid', 'Build Areas', '{"heading":"What DevLab Studios Builds","subheading":"The work sits between front-end delivery, backend implementation, and automation logic.","serviceIds":[]}', 50, 'published', datetime('now'), datetime('now')),
  ('about-founder', 'page-about', 'founder', 'richText', 'Founder Note', '{"eyebrow":"Founder Note","heading":"Built from hands-on software and operations experience.","body":"DevLab Studios is led by Stephen Rey Agustinez, a full-stack developer and AI automation specialist with experience across React, Astro, Java, Spring Boot, Laravel, REST APIs, SQL, Zapier, Make, n8n, and operational process improvement."}', 60, 'published', datetime('now'), datetime('now')),
  ('about-faq', 'page-about', 'faq', 'faq', 'FAQ', '{"heading":"FAQ","subheading":"Common questions about DevLab Studios delivery.","context":"about","items":[]}', 70, 'published', datetime('now'), datetime('now')),
  ('about-cta', 'page-about', 'cta', 'cta', 'Next Step', '{"eyebrow":"Next Step","heading":"Need a system designed around your workflow?","body":"","primaryCta":{"label":"Start a project conversation","href":"/contact"}}', 80, 'published', datetime('now'), datetime('now')),

  ('services-hero', 'page-services', 'hero', 'hero', 'Services Hero', '{"eyebrow":"Services as systems","heading":"Full-stack products and AI automation built around real operations.","subheading":"From the interface customers see to the APIs, data, and automated workflows behind it, every layer is designed as one maintainable system.","variant":"editorial","iconMotif":"fullstack","signals":[]}', 10, 'published', datetime('now'), datetime('now')),
  ('services-overview', 'page-services', 'overview', 'richText', 'Solution Categories', '{"heading":"Solution Categories","body":"Each category connects to actual project patterns already built across website, automation, API, and AI workflow work."}', 20, 'published', datetime('now'), datetime('now')),
  ('services-cta', 'page-services', 'cta', 'cta', 'Services CTA', '{"eyebrow":"Not sure where to start?","heading":"Start with the workflow that loses the most time or opportunities.","body":"A short discovery conversation can identify whether the best first move is a website, automation, AI agent, internal tool, or backend integration.","primaryCta":{"label":"Start a Project Conversation","href":"/contact"},"secondaryCta":{"label":"Read Insights","href":"/insights"}}', 30, 'published', datetime('now'), datetime('now')),
  ('services-faq-copy', 'page-services', 'faq', 'faq', 'FAQ Heading', '{"heading":"FAQ","subheading":"Common questions about DevLab Studios solution work.","context":"services","items":[]}', 40, 'published', datetime('now'), datetime('now')),

  ('insights-hero', 'page-insights', 'hero', 'hero', 'Insights Hero', '{"eyebrow":"Engineering Notes","heading":"Guides, AI updates, and operational notes for modern workflows.","subheading":"A CMS-managed feed of practical implementation notes across AI automation, websites, systems design, delivery workflows, and business operations.","variant":"editorial","iconMotif":"editorial","signals":[]}', 10, 'published', datetime('now'), datetime('now')),
  ('insights-featured', 'page-insights', 'featured', 'richText', 'Featured Insight', '{"heading":"Featured Insight","body":"Longer-form guidance and implementation notes with enough detail to read, not just skim."}', 20, 'published', datetime('now'), datetime('now')),
  ('insights-feed', 'page-insights', 'feed', 'richText', 'Latest Feed', '{"heading":"Latest From the Feed","body":"A practical mix of evergreen guides, automation notes, and current AI or systems insights."}', 30, 'published', datetime('now'), datetime('now')),
  ('insights-cta', 'page-insights', 'cta', 'cta', 'Insights CTA', '{"eyebrow":"Need implementation?","heading":"Turn the article into a working system.","body":"DevLab Studios can map the process, choose the stack, and build the website, automation, or internal workflow around current tools.","primaryCta":{"label":"Explore Services","href":"/services"}}', 40, 'published', datetime('now'), datetime('now')),

  ('contact-hero', 'page-contact', 'hero', 'hero', 'Contact Hero', '{"eyebrow":"Start a Project","heading":"Share where the workflow slows down.","subheading":"Share the interface, integration, data, or automation problem. DevLab Studios will respond with the clearest next step for the full system.","variant":"compact","iconMotif":"automation","signals":[]}', 10, 'published', datetime('now'), datetime('now')),
  ('contact-fields', 'page-contact', 'fields', 'stats', 'Form Fields', '{"heading":"Form Fields","items":[{"label":"Full Name","value":"Your name"},{"label":"Email","value":"name@email.com"},{"label":"Subject","value":"Project inquiry, support, collaboration"},{"label":"Message","value":"Share context, goals, timelines, and success criteria."}]}', 20, 'published', datetime('now'), datetime('now')),
  ('contact-submit', 'page-contact', 'submit', 'cta', 'Form Submission', '{"eyebrow":"","heading":"Contact form","body":"Responses are securely routed via Zoho.","primaryCta":{"label":"Send Message","href":"#contact-form"}}', 30, 'published', datetime('now'), datetime('now'))
)

INSERT OR IGNORE INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT
  id,
  CASE page_id
    WHEN 'page-home' THEN (SELECT id FROM pages WHERE slug = 'home')
    WHEN 'page-about' THEN (SELECT id FROM pages WHERE slug = 'about')
    WHEN 'page-services' THEN (SELECT id FROM pages WHERE slug = 'services')
    WHEN 'page-insights' THEN (SELECT id FROM pages WHERE slug = 'insights')
    WHEN 'page-contact' THEN (SELECT id FROM pages WHERE slug = 'contact')
    ELSE page_id
  END,
  section_key, section_type, title, content_json, sort_order, status, created_at, updated_at
FROM _public_section_alignment;

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT
  'home-hero-alignment', id, 'hero', 'hero', 'Home Hero',
  '{"eyebrow":"Full-stack Development + AI Automation","kicker":"Full-stack Development + AI Automation","tagline":"Your Vision, Digitally Crafted — one solution at a time, always evolving.","heading":"From first click to final handoff, build the whole system to move.","subheading":"DevLab Studios connects polished web experiences, dependable APIs, structured data, and AI-powered automation into one clear operating flow.","variant":"system","iconMotif":"fullstack","signals":[],"capabilities":[{"label":"01 / Build","value":"Full-stack Development"},{"label":"02 / Orchestrate","value":"AI Automation"},{"label":"03 / Connect","value":"Systems Integration"}],"canvasNodes":[{"key":"visitor","label":"Visitor / Lead","note":"Intent captured"},{"key":"interface","label":"Web Interface","note":"React + Astro"},{"key":"backend","label":"API Service","note":"Java + Laravel"},{"key":"data","label":"Structured Data","note":"SQL + D1"},{"key":"decision","label":"AI Decision","note":"Qualify + route"},{"key":"automation","label":"Automation","note":"n8n + Make"},{"key":"handoff","label":"Human Handoff","note":"CRM + response"}],"statusLabel":"System online","primaryCta":{"label":"Start a Project","href":"/contact"},"secondaryCta":{"label":"View Work","href":"/work"}}',
  10, 'published', datetime('now'), datetime('now')
FROM pages
WHERE slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM page_sections existing WHERE existing.page_id = pages.id AND existing.section_type = 'hero');

INSERT INTO page_sections (id, page_id, section_key, section_type, title, content_json, sort_order, status, created_at, updated_at)
SELECT
  'about-hero-alignment', id, 'hero', 'hero', 'About Hero',
  '{"eyebrow":"Founded March 2, 2026","heading":"Systems for clearer offers, faster operations, and cleaner handoffs.","subheading":"DevLab Studios helps businesses turn messy workflows into complete digital systems—customer-facing interfaces, dependable services, structured data, and automation that keeps work moving.","variant":"editorial","iconMotif":"fullstack","signals":[],"primaryCta":{"label":"View Services","href":"/services"},"secondaryCta":{"label":"Founder Profile","href":"/profile"}}',
  10, 'published', datetime('now'), datetime('now')
FROM pages
WHERE slug = 'about'
  AND NOT EXISTS (SELECT 1 FROM page_sections existing WHERE existing.page_id = pages.id AND existing.section_type = 'hero');

-- Add newly editable Home hero/card fields only when they do not already
-- exist. Existing editor values remain authoritative.
UPDATE page_sections
SET content_json = json_set(
      content_json,
      '$.kicker', COALESCE(json_extract(content_json, '$.kicker'), 'Full-stack Development + AI Automation'),
      '$.tagline', COALESCE(json_extract(content_json, '$.tagline'), 'Your Vision, Digitally Crafted — one solution at a time, always evolving.'),
      '$.capabilities', COALESCE(json_extract(content_json, '$.capabilities'), json('[{"label":"01 / Build","value":"Full-stack Development"},{"label":"02 / Orchestrate","value":"AI Automation"},{"label":"03 / Connect","value":"Systems Integration"}]')),
      '$.canvasNodes', COALESCE(json_extract(content_json, '$.canvasNodes'), json('[{"key":"visitor","label":"Visitor / Lead","note":"Intent captured"},{"key":"interface","label":"Web Interface","note":"React + Astro"},{"key":"backend","label":"API Service","note":"Java + Laravel"},{"key":"data","label":"Structured Data","note":"SQL + D1"},{"key":"decision","label":"AI Decision","note":"Qualify + route"},{"key":"automation","label":"Automation","note":"n8n + Make"},{"key":"handoff","label":"Human Handoff","note":"CRM + response"}]')),
      '$.statusLabel', COALESCE(json_extract(content_json, '$.statusLabel'), 'System online')
    ),
    updated_at = datetime('now')
WHERE page_id = (SELECT id FROM pages WHERE slug = 'home')
  AND section_type = 'hero';

UPDATE page_sections
SET content_json = json_set(
      content_json,
      '$.highlights', COALESCE(json_extract(content_json, '$.highlights'), json('[{"label":"Full-stack Development","value":"Interfaces, APIs, backend services, and data designed as one maintainable product."},{"label":"AI Automation","value":"Connected workflows, intelligent routing, and operational handoffs built for reliable delivery."}]'))
    ),
    updated_at = datetime('now')
WHERE page_id = (SELECT id FROM pages WHERE slug = 'home')
  AND section_key = 'credibility';

-- The Home hero's secondaryCta field predates this alignment and was never
-- read by the public renderer, so an earlier seed shipped it pointing at
-- /profile ("View Profile") while the live page always actually rendered a
-- hardcoded "View Work" button linking to /work. Now that the renderer
-- reads this field, correct that stale placeholder back to what has always
-- been live rather than silently changing the button when this ships.
UPDATE page_sections
SET content_json = json_set(content_json, '$.secondaryCta', json('{"label":"View Work","href":"/work"}')),
    updated_at = datetime('now')
WHERE page_id = (SELECT id FROM pages WHERE slug = 'home')
  AND section_type = 'hero'
  AND json_extract(content_json, '$.secondaryCta.href') = '/profile';
