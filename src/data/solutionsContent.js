/**
 * The business-facing solution architecture.
 *
 * This is a PRESENTATION layer over the existing `service_groups` collection,
 * not a replacement for it. Each category below maps to one or more existing
 * service-group ids via `serviceGroupIds`, so the CMS-managed catalogue keeps
 * owning the detailed capabilities and their project relationships, while
 * visitors see four understandable business outcomes instead of five
 * technology-shaped categories.
 *
 * Nothing in the service catalogue was deleted to make this work. If a
 * service group is added in the CMS and not mapped here, it still renders —
 * see the "unmapped groups" handling in src/pages/services.astro.
 */

export const solutionCategories = [
  {
    id: 'lead-intake-followup',
    eyebrow: 'Capture and follow up',
    title: 'Lead Intake and Follow-up Systems',
    shortTitle: 'Lead intake and follow-up',
    icon: 'Inbox',
    problem: 'Inquiries arrive, then sit. Follow-up depends on someone remembering.',
    description:
      'For businesses that need to capture, qualify, route, follow up with, and track opportunities without any step depending on a person remembering it.',
    outcome: 'Every inquiry is captured, recorded, routed to an owner, and visible until someone has acted on it.',
    capabilities: [
      'Conversion forms and landing pages',
      'Lead qualification rules',
      'CRM synchronization',
      'AI-assisted classification and drafting',
      'Email or SMS follow-up',
      'Calendar handoff and task creation',
      'Source attribution and pipeline visibility',
      'Failure alerts and human escalation',
    ],
    serviceGroupIds: ['lead-intake-scheduling', 'customer-response-ai-agents'],
    inquiryType: 'business_system',
    ctaLabel: 'Discuss your intake system',
  },
  {
    id: 'workflow-ai-automation',
    eyebrow: 'Repeat work',
    title: 'Workflow and AI Automation',
    shortTitle: 'Workflow and AI automation',
    icon: 'Workflow',
    problem: 'The same process runs every week across an inbox, a spreadsheet, and three tools.',
    description:
      'For repeated processes that move between inboxes, spreadsheets, CRMs, task systems, content, and customer communication.',
    outcome: 'The process runs on a schedule or a trigger, exceptions surface, and a person approves what should need approval.',
    capabilities: [
      'n8n, Make, or Zapier orchestration',
      'AI-assisted classification, drafting, and summarization',
      'Approval workflows and human-in-the-loop controls',
      'Notifications and escalation',
      'Data normalization across tools',
      'Scheduled processes',
      'Exception handling',
    ],
    serviceGroupIds: ['operations-data-workflows', 'content-growth-automation'],
    inquiryType: 'business_system',
    ctaLabel: 'Discuss your workflow',
  },
  {
    id: 'custom-software-operations',
    eyebrow: 'Beyond an automation',
    title: 'Custom Software and Operations Systems',
    shortTitle: 'Custom software and operations',
    icon: 'Code2',
    problem: 'The work has outgrown what a spreadsheet or an off-the-shelf tool can hold.',
    description:
      'For businesses that need a real interface, a real data model, and services that other systems can talk to.',
    outcome: 'A maintainable system with its own data, its own interface, and documented integration points.',
    capabilities: [
      'Customer-facing interfaces',
      'Internal workflow tools',
      'APIs and webhooks',
      'Backend services',
      'SQL-backed systems',
      'Dashboards and reporting workflows',
      'Custom integrations',
      'Deployment and documentation',
    ],
    serviceGroupIds: ['web-business-interfaces'],
    inquiryType: 'software_project',
    ctaLabel: 'Discuss your build',
  },
  {
    id: 'workflow-systems-audit',
    eyebrow: 'Start here',
    title: 'Workflow Systems Audit',
    shortTitle: 'Workflow systems audit',
    icon: 'ClipboardCheck',
    problem: 'You know something is losing time. You are not yet sure which part to fix first.',
    description:
      'A structured review of one workflow end to end, ending in a recommended architecture and a prioritized roadmap — whether or not the build happens here.',
    outcome: 'A written recommendation you can act on, in priority order.',
    capabilities: [
      'Current workflow review, step by step',
      'Bottleneck identification',
      'Handoff and ownership analysis',
      'Data and integration assessment',
      'Recommended architecture',
      'Prioritized implementation roadmap',
    ],
    serviceGroupIds: [],
    isEntryOffer: true,
    offerId: 'workflow-systems-audit',
    inquiryType: 'workflow_audit',
    ctaLabel: 'Request a workflow audit',
  },
]

/** The operational problems the studio actually addresses, in the visitor's words. */
export const operationalProblems = [
  {
    title: 'Leads wait too long for a reply',
    description: 'An inquiry arrives outside working hours, or lands in an inbox nobody owns, and the first response happens whenever someone notices.',
    icon: 'Timer',
  },
  {
    title: 'Follow-up depends on someone remembering',
    description: 'There is no record of what stage a conversation reached, so the next step happens only if the right person recalls it.',
    icon: 'RefreshCw',
  },
  {
    title: 'Customer data is spread across disconnected tools',
    description: 'The same contact exists in an inbox, a spreadsheet, a form provider, and a CRM, and none of them agree.',
    icon: 'Database',
  },
  {
    title: 'The same details get typed in more than once',
    description: 'Information already captured at intake is re-entered by hand further down the process.',
    icon: 'ClipboardList',
  },
  {
    title: 'Nobody owns the step between two tools',
    description: 'Work reaches the boundary between two systems and stops there, because the handoff was never assigned to anyone.',
    icon: 'GitBranch',
  },
  {
    title: 'Automations fail without telling anyone',
    description: 'A workflow stops running and the first sign of it is a customer asking why they never heard back.',
    icon: 'AlertTriangle',
  },
  {
    title: 'A website captures inquiries with no operational handoff',
    description: 'The form works, the email sends, and after that the inquiry has no status, no owner, and no record.',
    icon: 'Inbox',
  },
]

/**
 * How the studio builds. Stated as commitments about system behavior that are
 * demonstrably true of this site's own lead pipeline — see
 * src/worker/inquiryService.js — rather than as claims about results.
 */
export const reliabilityPrinciples = [
  {
    label: 'Persist before you deliver',
    value: 'A submission is written to the database before any email, CRM, or webhook call is attempted, so an outage leaves it undelivered rather than lost.',
  },
  {
    label: 'Failures are visible, not silent',
    value: 'Every delivery attempt is recorded with its outcome and whether retrying it can help, so a broken integration surfaces to an operator instead of to a customer.',
  },
  {
    label: 'Deterministic rules own routing',
    value: 'AI summarizes and drafts; sequence, permissions, and delivery are decided by rules that can be read, tested, and explained.',
  },
  {
    label: 'Every workflow ends at a person',
    value: 'Anything ambiguous or high-impact routes to a human reviewer rather than being auto-resolved.',
  },
]

/** The four delivery phases, business-outcome first. */
export const deliveryApproach = [
  {
    step: '01',
    title: 'Map the workflow',
    description:
      'Walk the current process end to end: where it stalls, where ownership is unclear, what the data actually does, and which integrations already exist.',
    outcomes: ['Current workflow review', 'Bottleneck and handoff mapping', 'Priority opportunities'],
    icon: 'Search',
  },
  {
    step: '02',
    title: 'Agree the system',
    description:
      'A written recommendation: the system structure, the tools, the delivery phases, and what will be true once it works — before any build starts.',
    outcomes: ['Recommended architecture', 'Scope and delivery phases', 'Defined success criteria'],
    icon: 'Lightbulb',
  },
  {
    step: '03',
    title: 'Build in phases',
    description:
      'Implementation in controlled phases across interface, integration, data, and automation, with each layer tested before the next depends on it.',
    outcomes: ['Phased implementation', 'Connected integrations and data flow', 'Validation for reliability'],
    icon: 'Settings',
  },
  {
    step: '04',
    title: 'Hand it over',
    description:
      'Deployment, a walkthrough, documentation, and the failure paths written down — so the system can be operated by the team, not only by whoever built it.',
    outcomes: ['Launch-ready delivery', 'Documentation and walkthrough', 'Known failure paths and owners'],
    icon: 'CheckCircle2',
  },
]

export function getSolutionCategory(id) {
  return solutionCategories.find((category) => category.id === id) || null
}

export default solutionCategories
