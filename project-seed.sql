INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'w1-react-modern',
  'Modern React Landing Page',
  'A modern, animated landing page built with React and Tailwind CSS. Showcases a tech-focused, responsive design.',
  '["React","Tailwind CSS"]',
  '/landing-sample-react',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/sample-react-landing.webp',
  'sample-react-landing.webp',
  'Website',
  10,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'w2-html-minimalist',
  'Minimalist HTML/CSS/JS',
  'A clean, minimalist landing page using only HTML, CSS, and vanilla JavaScript. Fast, lightweight, and static.',
  '["HTML","CSS","JavaScript"]',
  '/landing-sample-html',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/sample-html-landing.webp',
  'sample-html-landing.webp',
  'Website',
  20,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'w4-laravel-fullstack',
  'Full Stack (Laravel + MariaDB)',
  'A dynamic full stack landing page with backend interaction, built using Laravel (PHP) and MariaDB. Features a contact form and dashboard UI.',
  '["Laravel","PHP","MariaDB","Blade"]',
  '/landing-sample-fullstack',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/sample-fullstack-landing.webp',
  'sample-fullstack-landing.webp',
  'Website',
  30,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'w5-local-service',
  'Local Service Business',
  'A local lead-generation website sample with strong call CTAs, booking form, trust stats, and service cards.',
  '["React","Tailwind CSS","Lead Generation UX"]',
  '/landing-sample-local-service',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/sample-local-service-landing.webp',
  'sample-local-service-landing.webp',
  'Website',
  40,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'w6-ecommerce',
  'E-commerce Product Landing',
  'A conversion-focused e-commerce design with featured product block, product cards, ratings, and purchase CTA flow.',
  '["React","Tailwind CSS","E-commerce UI"]',
  '/landing-sample-ecommerce',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/sample-ecommerce-landing.webp',
  'sample-ecommerce-landing.webp',
  'Website',
  50,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p10-automated-lead-qualification',
  'Automated Lead Qualification',
  'Retell webhook workflow that receives AI voice call callbacks, analyzes transcripts, matches callers to existing lead rows, archives call records, updates monitoring, and feeds qualified opportunities into an acquisitions follow-up pipeline.',
  '["Retell AI","Claude/OpenAI","Google Sheets","Google Docs","Google Drive","Webhook"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/Automated_Lead_Qualification.webp',
  'Automated_Lead_Qualification.webp',
  'Automation',
  100,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p11-wholesaling-buyer-intelligence',
  'Wholesaling Buyer Intelligence',
  'n8n deal-intake system that geocodes property addresses, checks a 15-day address cache, looks up property and buyer data, skip-traces LLC and person routes, normalizes contacts, and uses AI to rank the best cash buyers into Google Sheets.',
  '["n8n","Google Geocoding API","BatchData","Skip Sherpa","OpenAI API","Google Sheets"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/Wholesaling_BuyerIntelligence_v1D_Improvements.webp',
  'Wholesaling_BuyerIntelligence_v1D_Improvements.webp',
  'Automation',
  110,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p1-content-repurposing',
  'Content Repurposing Automation',
  'Automation that repurposes content from a single uploaded file by filtering inputs, generating AI outputs, and routing results into multiple publishing paths (e.g., Facebook Pages and LinkedIn).',
  '["Zapier","Google Drive","AI by Zapier","Facebook Pages","LinkedIn"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project1-content-repurposing.webp',
  'project1-content-repurposing.webp',
  'Automation',
  120,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p2-escalation-email',
  'Automated Email Response for Escalations',
  'Scheduled workflow that checks tasks and sends email responses for escalations, keeping communication consistent and reducing manual handling.',
  '["Zapier","Schedule","Asana","Gmail"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project2-escalation-email.webp',
  'project2-escalation-email.webp',
  'Automation',
  130,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p2-quote-follow-up',
  'Quote Follow-up Automation',
  'Weekly scheduled automation that finds relevant tasks and sends quote follow-up emails to improve response rates and maintain consistent outreach.',
  '["Zapier","Schedule","Asana","Gmail"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project2-quote-followup.webp',
  'project2-quote-followup.webp',
  'Automation',
  140,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p2-combined-automation',
  'Combined Multi-step Client Workflow Automation',
  'End-to-end workflow triggered by task updates that branches into multiple paths (ready to start, no response, approved, paid & closed), creates folders/subtasks, and sends appropriate email sequences per service.',
  '["Zapier","Asana","Gmail","Google Drive","Paths/Router"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project2-combined-automation.webp',
  'project2-combined-automation.webp',
  'Automation',
  150,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p3-leads-enrichment',
  'Automated Leads Enrichment',
  'Webhook-driven enrichment that formats incoming lead data, enriches via external lookup, routes by priority, logs high-priority leads to Sheets, notifies stakeholders, and emails outcomes.',
  '["Zapier","Webhooks","Formatter","Google Sheets","Slack","Gmail"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project3-leads-enrichment.webp',
  'project3-leads-enrichment.webp',
  'Automation',
  160,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p4-xero-to-asana',
  'Export Xero Transactions -> Upload CSV to Asana',
  'Pulls account transactions from Xero via API, routes/iterates records, writes and aggregates data in Google Sheets, then uploads the generated CSV/attachment to Asana for processing and tracking.',
  '["Make (Integromat)","Xero API","Google Sheets","Iterator/Router","Asana"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project4-xero-to-asana.webp',
  'project4-xero-to-asana.webp',
  'Automation',
  170,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p5-gmail-attachments-drive',
  'Auto-sort Gmail Attachments to Google Drive',
  'Watches Gmail, extracts attachments, optionally uses Gemini AI for processing, uploads files to Drive, logs metadata to Google Sheets, and sends confirmation emails for visibility.',
  '["Make (Integromat)","Gmail","Google Drive","Google Sheets","Gemini AI"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project5-gmail-drive-sort.webp',
  'project5-gmail-drive-sort.webp',
  'Automation',
  180,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p6-messenger-ai-agent',
  'Facebook Messenger AI Agent',
  'Webhook-based Messenger agent that filters events, fetches context, generates AI replies, triggers downstream actions via HTTP, and responds back through the webhook flow.',
  '["n8n","Webhooks","AI Agent","HTTP Request","Gemini Chat Model","Memory"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project6-fb-messenger-ai.webp',
  'project6-fb-messenger-ai.webp',
  'Automation',
  190,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p7-ai-social-content',
  'AI Social Media Content Creator',
  'Scheduled pipeline that generates quote copy, checks duplicates in Google Sheets, fetches weather data, generates images, saves image URLs, and publishes to Facebook using Graph API.',
  '["n8n","Schedule","OpenWeatherMap","Google Sheets","Facebook Graph API","Gemini Chat Model"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project7-ai-social-creator.webp',
  'project7-ai-social-creator.webp',
  'Automation',
  200,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p8-arv-enterprise-geocoding',
  'ARV Enterprise Geocoding Automation',
  'Automation workflow for generating proposed geocoding outputs from business records, structuring location data for downstream review and enterprise mapping use.',
  '["Automation Workflow","Geocoding","Data Structuring","Review Pipeline"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/ARV_Generate_Proposed_v1.4_Enterprise_Geocoding.webp',
  'ARV_Generate_Proposed_v1.4_Enterprise_Geocoding.webp',
  'Automation',
  210,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename, type, sort_order, status, created_at, updated_at
) VALUES (
  'p9-guest-researcher-calendar-client',
  'Guest Researcher From Booked Calendar Client',
  'Booked-calendar intake automation that turns client scheduling data into a guest research workflow, helping the team prepare context and next-step actions before engagement.',
  '["Calendar Intake","Client Routing","Research Workflow","Automation"]',
  '#',
  '#',
  'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/Guest-Researcher-from-a-booked-calendar-client.webp',
  'Guest-Researcher-from-a-booked-calendar-client.webp',
  'Automation',
  220,
  'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  tech_stack = excluded.tech_stack,
  live_url = excluded.live_url,
  source_url = excluded.source_url,
  image_url = excluded.image_url,
  image_filename = excluded.image_filename,
  type = excluded.type,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = excluded.updated_at;
