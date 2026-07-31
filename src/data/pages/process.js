// Reuses the same 4-phase process copy already live on the homepage
// (src/pages/index.astro's processSteps) rather than inventing new
// marketing claims for a dedicated page.
export const processPage = {
  slug: 'process',
  title: 'Our Process',
  status: 'published',
  blocks: [
    {
      type: 'hero',
      props: {
        eyebrow: 'How we work',
        heading: 'A four-phase delivery model built for real operations.',
        subheading: 'Every engagement moves through the same structure: diagnose the problem, define the approach, build in controlled phases, and deliver with full handoff support.',
        primaryCta: { label: 'Book a Consultation', href: '/contact' },
        secondaryCta: { label: 'View Services', href: '/services' },
      },
    },
    {
      type: 'processSteps',
      props: {
        heading: 'Problem To Solution Approach',
        steps: [
          {
            title: 'Problem Audit',
            description: 'We start by mapping the actual business problem, not just the requested feature. That includes bottlenecks, broken handoffs, slow response points, missing integrations, and unclear customer flow.',
          },
          {
            title: 'Solution Proposal',
            description: 'After the audit, we define the best-fit solution model. This usually includes the recommended system structure, scope, tools, delivery phases, and the expected business outcome before any build work begins.',
          },
          {
            title: 'Solution Build-Up',
            description: 'Once the direction is approved, we build the website, automation, integration, or backend workflow in structured phases so each part is tested, connected, and ready for real use.',
          },
          {
            title: 'Solution Delivery',
            description: 'The final stage focuses on launch readiness, handoff, and operational clarity. That includes deployment, walkthroughs, documentation, and making sure the system can actually be used by the client or team.',
          },
        ],
      },
    },
    {
      type: 'cta',
      props: {
        heading: 'Ready to start with a problem audit?',
        body: 'A short discovery conversation can identify whether your best first move is a website, automation, AI agent, internal tool, or backend integration.',
        primaryCta: { label: 'Start a Project Conversation', href: '/contact' },
      },
    },
  ],
}

export default processPage
