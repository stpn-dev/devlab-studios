import type { PageData } from '../../lib/content/pages'

export const workPage: PageData = {
  slug: 'work',
  title: 'Work',
  status: 'published',
  blocks: [
    {
      type: 'hero',
      props: {
        eyebrow: 'Selected Work',
        heading: 'Automation systems with the decisions, data flow, and handoff explained.',
        subheading: 'Real project write-ups covering the operational problem, system architecture, safeguards, and practical value—not just a gallery of workflow screenshots.',
        variant: 'editorial',
        iconMotif: 'automation',
        signals: [],
        primaryCta: { label: 'Explore Selected Projects', href: '#automation-projects' },
        secondaryCta: { label: 'Start a Project Conversation', href: '/contact' },
      },
    },
    {
      type: 'workProjectShowcase',
      props: {
        heading: 'Selected automation projects',
        subheading: 'A closer look at how each system moves from trigger to verified operational handoff.',
        items: [
          {
            projectId: 'p10-automated-lead-qualification',
            description: 'A three-workflow closed-loop system for real estate lead qualification: scheduled intake normalizes and deduplicates leads before dispatching authenticated outbound AI voice calls via Retell, inbound caller lookup matches phone numbers back to lead records, and post-call webhook processing analyzes transcripts, updates records, and routes qualified opportunities to human acquisitions handoff — with API response validation, failure routing, and monitoring throughout.',
            challenge: 'Raw property leads needed consistent validation, qualification, calling, and follow-up without losing context between tools.',
            systemArchitecture: 'Scheduled intake normalizes and deduplicates records, authenticated Retell calls handle outbound conversations, and post-call webhooks analyze transcripts before routing qualified opportunities to a human acquisitions queue.',
            deliveryValue: 'The build turns disconnected lead tasks into a monitored flow with explicit validation, failure paths, and a clear human handoff.',
            status: 'published',
          },
          {
            projectId: 'p11-wholesaling-buyer-intelligence',
            description: 'n8n deal-intake system that geocodes property addresses, checks a 15-day address cache, looks up property and buyer data, skip-traces LLC and person routes, normalizes contacts, and uses AI to rank the best cash buyers into Google Sheets.',
            challenge: 'Buyer research required several location, property, skip-trace, and ranking steps that were difficult to repeat consistently by hand.',
            systemArchitecture: 'An n8n workflow geocodes the property, checks a reusable address cache, gathers property and buyer data, normalizes LLC and person contacts, then uses AI-assisted ranking to prepare a focused buyer list.',
            deliveryValue: 'The system keeps data provenance visible while reducing repetitive research and presenting the team with a cleaner shortlist for review.',
            status: 'published',
          },
          {
            projectId: 'p6-messenger-ai-agent',
            description: 'Webhook-based Messenger agent that filters events, fetches context, generates AI replies, triggers downstream actions via HTTP, and responds back through the webhook flow.',
            challenge: 'Incoming Messenger conversations needed fast, context-aware replies without allowing an AI response step to control the entire workflow.',
            systemArchitecture: 'Webhook events are filtered and enriched with conversation context, an AI agent drafts the response, controlled HTTP actions trigger downstream work, and the final message returns through the Messenger flow.',
            deliveryValue: 'Deterministic workflow steps retain control of routing and integrations while AI handles the language-heavy part of the interaction.',
            status: 'published',
          },
        ],
      },
    },
    {
      type: 'featuredCaseStudies',
      props: {
        heading: 'Client case studies',
        subheading: 'Published engagements with additional context on the problem, delivery, and result.',
        limit: 6,
      },
    },
    {
      type: 'cta',
      props: {
        heading: 'Have a workflow that should operate like a system?',
        body: 'The first step maps the trigger, rules, data, integrations, failure paths, and human handoff before deciding what should be automated.',
        primaryCta: { label: 'Start a Project', href: '/contact' },
      },
    },
  ],
}

export default workPage
