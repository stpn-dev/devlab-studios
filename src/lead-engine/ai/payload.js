/**
 * Builds the compact lead intelligence sent to Workers AI.
 *
 * Full website HTML is NEVER sent. Three reasons, in order of how much they
 * matter: a page of HTML is mostly markup the model cannot use and would be
 * charged for; raw page text is the highest-risk prompt-injection surface in
 * the system; and a model given a whole page will summarize the page rather
 * than answer the question it was asked.
 *
 * What goes instead is an explicit allow-list — company facts, the signal keys
 * that were detected, short evidence excerpts, and the rule score. If a field
 * is not named in this file, the model does not see it.
 */

import { SIGNAL_LABELS } from '../config/defaults.js'

const MAX_SIGNALS = 30
const MAX_EVIDENCE_ITEMS = 8
const MAX_EVIDENCE_CHARS = 240
const MAX_PAGE_SUMMARIES = 4

function trim(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * The opportunity-review payload.
 *
 * @param {{
 *   company: object, campaign: object, signals: Array<object>, score: object,
 *   technologies?: string[], pageSummaries?: Array<object>
 * }} input
 */
export function buildOpportunityPayload({ company, campaign, signals, score, technologies = [], pageSummaries = [] }) {
  const detected = signals.filter((signal) => signal.detected !== false)

  return {
    company: {
      name: company.name,
      website: company.websiteUrl,
      industry: company.industry || campaign?.config?.industryLabel || null,
      location: [company.city, company.region || company.metro, company.countryCode].filter(Boolean).join(', ') || null,
    },
    campaign_context: {
      // The campaign's own description of who it is targeting, so the model
      // judges fit against the operator's stated intent rather than against its
      // own idea of a good lead.
      target_industry: campaign?.config?.industryLabel || null,
      target_description: trim(campaign?.description, 300) || null,
    },
    detected_technology: technologies.slice(0, 12),
    pages_analyzed: pageSummaries.slice(0, MAX_PAGE_SUMMARIES).map((page) => ({
      url: page.url,
      title: trim(page.title, 120),
    })),
    // Labels rather than raw keys: the model reads English better than it reads
    // MANUAL_PHONE_INTAKE, and the label is already the operator-facing wording.
    detected_signals: detected.slice(0, MAX_SIGNALS).map((signal) => ({
      signal: SIGNAL_LABELS[signal.signalKey] || signal.signalKey,
      detail: trim(signal.valueText, 120) || undefined,
    })),
    supporting_evidence: detected
      .filter((signal) => signal.evidence)
      .slice(0, MAX_EVIDENCE_ITEMS)
      .map((signal) => ({
        quote: trim(signal.evidence, MAX_EVIDENCE_CHARS),
        from: signal.sourceUrl,
      })),
    rule_score: {
      total: score.total,
      icp_fit: score.icpFit,
      workflow_opportunity: score.workflowOpportunity,
      contactability: score.contactability,
      data_quality: score.dataQuality,
    },
  }
}

/**
 * The outreach-draft brief.
 *
 * Carries the sender identity explicitly so the model signs off correctly
 * without being told to guess, and carries `capabilities` so the "do not claim
 * an unlisted capability" rule in the prompt has something concrete to check
 * against.
 *
 * @param {{ company, opportunity, contact, sender, capabilities?, evidence?, trackedLinks? }} input
 */
export function buildOutreachBrief({ company, opportunity, contact, sender, capabilities = [], evidence = [], trackedLinks = [] }) {
  return {
    company: {
      name: company.name,
      website: company.websiteUrl,
      industry: company.industry || null,
      location: [company.city, company.region || company.metro].filter(Boolean).join(', ') || null,
    },
    recipient: {
      // The address itself is not needed to write the email and is not sent.
      // Only whether it is a role or a named address, which affects the
      // greeting.
      address_type: contact?.emailType || 'role',
      name: contact?.fullName || null,
      role: contact?.roleTitle || null,
    },
    opportunity: {
      type: opportunity?.opportunity_type || null,
      observed_problem: trim(opportunity?.observed_problem, 400),
      recommended_solution: trim(opportunity?.recommended_solution, 400),
      outreach_angle: trim(opportunity?.outreach_angle, 300),
      devlab_service: opportunity?.devlab_service || null,
    },
    supporting_evidence: evidence.slice(0, MAX_EVIDENCE_ITEMS).map((item) => trim(item, MAX_EVIDENCE_CHARS)),
    sender: {
      name: sender?.senderName || sender?.legalName || 'DevLab Studios',
      studio: sender?.legalName || 'DevLab Studios',
      website: sender?.website || 'https://www.devlabstudios.com',
    },
    capabilities,
    // Only links supplied here may appear in the draft; the prompt says so and
    // validate.js enforces it.
    allowed_links: trackedLinks,
  }
}

/**
 * The reply-analysis context.
 *
 * Bounded to the recent conversation rather than its whole history: a long
 * thread would push the new message far down a small model's context, and the
 * question being asked is about the new message.
 *
 * @param {{ company, opportunity, messages, newMessage }} input
 */
export function buildReplyContext({ company, opportunity, messages, newMessage }) {
  return {
    company: {
      name: company.name,
      website: company.websiteUrl,
      industry: company.industry || null,
    },
    opportunity: opportunity
      ? {
          type: opportunity.opportunity_type,
          observed_problem: trim(opportunity.observed_problem, 300),
          recommended_solution: trim(opportunity.recommended_solution, 300),
        }
      : null,
    conversation_so_far: messages.slice(-6).map((message) => ({
      from: message.direction === 'inbound' ? 'prospect' : 'us',
      sent_at: message.sentAt || message.receivedAt,
      subject: trim(message.subject, 150),
      body: trim(message.bodyText, 1_500),
    })),
    new_message: {
      from: 'prospect',
      received_at: newMessage.receivedAt,
      subject: trim(newMessage.subject, 150),
      body: trim(newMessage.bodyText, 3_000),
    },
  }
}

/**
 * The reply-draft brief.
 *
 * @param {{ company, opportunity, analysis, messages, sender, capabilities?, subject? }} input
 */
export function buildReplyBrief({ company, opportunity, analysis, messages, sender, capabilities = [], subject = '' }) {
  return {
    company: { name: company.name, website: company.websiteUrl, industry: company.industry || null },
    opportunity: opportunity
      ? {
          type: opportunity.opportunity_type,
          observed_problem: trim(opportunity.observed_problem, 300),
          recommended_solution: trim(opportunity.recommended_solution, 300),
        }
      : null,
    their_message_analysis: {
      intent: analysis.intent,
      summary: analysis.summary,
      questions: analysis.questions_detected,
      important_new_information: analysis.important_new_information,
      recommended_action: analysis.recommended_action,
      recommended_strategy: analysis.recommended_strategy,
    },
    conversation_so_far: messages.slice(-4).map((message) => ({
      from: message.direction === 'inbound' ? 'prospect' : 'us',
      subject: trim(message.subject, 150),
      body: trim(message.bodyText, 1_200),
    })),
    thread_subject: trim(subject, 150),
    sender: {
      name: sender?.senderName || sender?.legalName || 'DevLab Studios',
      studio: sender?.legalName || 'DevLab Studios',
    },
    capabilities,
  }
}
