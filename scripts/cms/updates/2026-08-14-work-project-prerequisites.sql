-- Guarded prerequisites for the initial Work showcase.
-- This only fills missing canonical Project rows. It never overwrites an
-- existing Project and does not upload, delete, or otherwise mutate R2.

INSERT INTO projects (
  id, title, description, tech_stack, live_url, source_url, image_url, image_filename,
  type, sort_order, status, created_at, updated_at
) VALUES
  (
    'p10-automated-lead-qualification',
    'Automated Real Estate Lead Qualification & Outbound Calling System',
    'A three-workflow closed-loop system for real estate lead qualification: scheduled intake normalizes and deduplicates leads before dispatching authenticated outbound AI voice calls via Retell, inbound caller lookup matches phone numbers back to lead records, and post-call webhook processing analyzes transcripts, updates records, and routes qualified opportunities to human acquisitions handoff — with API response validation, failure routing, and monitoring throughout.',
    '["Retell AI","Claude/OpenAI","Google Sheets","Google Docs","Google Drive","Webhook","n8n"]',
    '#', '#',
    'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/Automated_Lead_Qualification.webp',
    'Automated_Lead_Qualification.webp',
    'Automation', 100, 'published',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'p11-wholesaling-buyer-intelligence',
    'Wholesaling Buyer Intelligence',
    'n8n deal-intake system that geocodes property addresses, checks a 15-day address cache, looks up property and buyer data, skip-traces LLC and person routes, normalizes contacts, and uses AI to rank the best cash buyers into Google Sheets.',
    '["n8n","Google Geocoding API","BatchData","Skip Sherpa","OpenAI API","Google Sheets"]',
    '#', '#',
    'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/Wholesaling_BuyerIntelligence_v1D_Improvements.webp',
    'Wholesaling_BuyerIntelligence_v1D_Improvements.webp',
    'Automation', 110, 'published',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'p6-messenger-ai-agent',
    'Facebook Messenger AI Agent',
    'Webhook-based Messenger agent that filters events, fetches context, generates AI replies, triggers downstream actions via HTTP, and responds back through the webhook flow.',
    '["n8n","Webhooks","AI Agent","HTTP Request","Gemini Chat Model","Memory"]',
    '#', '#',
    'https://pub-401ca3448c3348158cdb3e4e9a9dcb20.r2.dev/projects/project6-fb-messenger-ai.webp',
    'project6-fb-messenger-ai.webp',
    'Automation', 190, 'published',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
ON CONFLICT(id) DO NOTHING;
