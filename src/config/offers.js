/**
 * Entry offers and lead magnets, in one server-owned registry.
 *
 * Deliberately not free-form client input: a form posts only an `offerId`,
 * and everything about what gets delivered (title, destination URL, the CTA
 * wording) is resolved here. That means a visitor can never point the
 * confirmation email at an arbitrary URL, and the delivery layer never has to
 * trust a field that arrived over the network.
 *
 * The destination for the lead-intake checklist is the existing published
 * insight article — a real, already-written resource, not a fabricated
 * downloadable asset.
 */

export const LEAD_MAGNETS = {
  'lead-intake-checklist': {
    id: 'lead-intake-checklist',
    title: 'The Lead Intake and Follow-up Systems Checklist',
    summary:
      'The checks we run on a lead intake and follow-up system before calling it reliable: capture, qualification, routing, delivery confirmation, failure visibility, and human handoff.',
    url: 'https://www.devlabstudios.com/insights/lead-intake-automation-checklist',
    path: '/insights/lead-intake-automation-checklist',
    ctaLabel: 'Send me the checklist',
  },
}

export const ENTRY_OFFERS = {
  'workflow-systems-audit': {
    id: 'workflow-systems-audit',
    title: 'Workflow Systems Audit',
    inquiryType: 'workflow_audit',
    summary:
      'A structured review of one workflow end to end — where it stalls, where ownership is unclear, what the data and integrations actually do, and the smallest reliable system that fixes it.',
    includes: [
      'Current workflow review, step by step',
      'Bottleneck and delay identification',
      'Handoff and ownership analysis',
      'Data and integration assessment',
      'Recommended architecture',
      'Prioritized implementation roadmap',
    ],
  },
}

export function getLeadMagnet(id) {
  return LEAD_MAGNETS[id] || null
}

export function getEntryOffer(id) {
  return ENTRY_OFFERS[id] || null
}
