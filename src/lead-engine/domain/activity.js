/**
 * The activity event vocabulary.
 *
 * `lead_activity.event_type` has no CHECK constraint (unlike `stage`), because
 * this set grows with every capability and a migration per event type would
 * make adding one needlessly expensive. This file is the contract instead:
 * `recordActivity` rejects an event that is not listed here, so the vocabulary
 * stays closed without the schema having to enforce it.
 */

export const ACTIVITY = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  SOURCE_NORMALIZED: 'SOURCE_NORMALIZED',
  DUPLICATE_SKIPPED: 'DUPLICATE_SKIPPED',

  CRAWL_STARTED: 'CRAWL_STARTED',
  CRAWL_COMPLETED: 'CRAWL_COMPLETED',
  CRAWL_FAILED: 'CRAWL_FAILED',
  CRAWL_SKIPPED: 'CRAWL_SKIPPED',
  BROWSER_RUN_USED: 'BROWSER_RUN_USED',
  SIGNALS_EXTRACTED: 'SIGNALS_EXTRACTED',

  RULE_SCORED: 'RULE_SCORED',
  RULE_QUALIFIED: 'RULE_QUALIFIED',
  RULE_REJECTED: 'RULE_REJECTED',

  AI_REVIEW_STARTED: 'AI_REVIEW_STARTED',
  AI_QUALIFIED: 'AI_QUALIFIED',
  AI_REJECTED: 'AI_REJECTED',
  AI_FAILED: 'AI_FAILED',

  CONTACT_FOUND: 'CONTACT_FOUND',
  CONTACT_MISSING: 'CONTACT_MISSING',
  CONTACT_ADDED_MANUALLY: 'CONTACT_ADDED_MANUALLY',

  COMPLIANCE_REVIEWED: 'COMPLIANCE_REVIEWED',
  COMPLIANCE_BLOCKED: 'COMPLIANCE_BLOCKED',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',

  OUTREACH_DRAFT_CREATED: 'OUTREACH_DRAFT_CREATED',
  OUTREACH_DRAFT_EDITED: 'OUTREACH_DRAFT_EDITED',
  OUTREACH_DRAFT_REGENERATED: 'OUTREACH_DRAFT_REGENERATED',
  OUTREACH_DRAFT_EXPORTED: 'OUTREACH_DRAFT_EXPORTED',
  OUTBOUND_SEND_CONFIRMED: 'OUTBOUND_SEND_CONFIRMED',
  /**
   * The transmitter could not put the message on the wire AT ALL.
   *
   * Deliberately distinct from BOUNCED. A bounce is the recipient's mail system
   * refusing a message that reached it; this is our own side failing before it
   * ever left -- nodemailer missing, Postfix down, the CMS unreachable, a
   * runtime error. Neither proves anything about the address, so this must
   * never reach suppression.
   */
  OUTBOUND_SEND_FAILED: 'OUTBOUND_SEND_FAILED',

  OUTBOUND_MESSAGE_SENT: 'OUTBOUND_MESSAGE_SENT',
  AWAITING_REPLY: 'AWAITING_REPLY',
  INBOUND_REPLY: 'INBOUND_REPLY',
  REPLY_ANALYZED: 'REPLY_ANALYZED',
  REPLY_DRAFT_CREATED: 'REPLY_DRAFT_CREATED',
  REPLY_DRAFT_EXPORTED: 'REPLY_DRAFT_EXPORTED',
  MANUAL_REPLY_SENT: 'MANUAL_REPLY_SENT',

  MEETING_BOOKED: 'MEETING_BOOKED',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  WON: 'WON',
  LOST: 'LOST',

  DO_NOT_CONTACT: 'DO_NOT_CONTACT',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  BOUNCED: 'BOUNCED',
  COMPLAINT: 'COMPLAINT',
  SUPPRESSED: 'SUPPRESSED',
  SUPPRESSION_REMOVED: 'SUPPRESSION_REMOVED',

  STAGE_CHANGED: 'STAGE_CHANGED',
  HELD: 'HELD',
  RESUMED: 'RESUMED',
  ARCHIVED: 'ARCHIVED',
  NOTE_ADDED: 'NOTE_ADDED',

  TRACKED_LINK_CLICKED: 'TRACKED_LINK_CLICKED',
  WEBSITE_CONTACT_CONVERSION: 'WEBSITE_CONTACT_CONVERSION',

  USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',
  JOB_FAILED: 'JOB_FAILED',
  JOB_DEAD_LETTERED: 'JOB_DEAD_LETTERED',
  MAILBOX_SYNC_FAILED: 'MAILBOX_SYNC_FAILED',
})

export const ALL_ACTIVITY_TYPES = Object.freeze(Object.values(ACTIVITY))

/** @param {string} eventType */
export function isValidActivityType(eventType) {
  return ALL_ACTIVITY_TYPES.includes(eventType)
}

/**
 * Human-readable one-liners for the timeline. An event without an entry falls
 * back to its own code, so a new event type is readable before it is pretty.
 */
export const ACTIVITY_LABELS = Object.freeze({
  DISCOVERED: 'Discovered',
  SOURCE_NORMALIZED: 'Source record normalized',
  DUPLICATE_SKIPPED: 'Duplicate skipped',
  CRAWL_STARTED: 'Website research started',
  CRAWL_COMPLETED: 'Website research completed',
  CRAWL_FAILED: 'Website research failed',
  CRAWL_SKIPPED: 'Website research skipped',
  BROWSER_RUN_USED: 'Browser rendering used',
  SIGNALS_EXTRACTED: 'Signals extracted',
  RULE_SCORED: 'Scored',
  RULE_QUALIFIED: 'Passed rule qualification',
  RULE_REJECTED: 'Failed rule qualification',
  AI_REVIEW_STARTED: 'AI review started',
  AI_QUALIFIED: 'AI qualified',
  AI_REJECTED: 'AI rejected',
  AI_FAILED: 'AI review failed',
  CONTACT_FOUND: 'Public business contact found',
  CONTACT_MISSING: 'No public business contact found',
  CONTACT_ADDED_MANUALLY: 'Contact added manually',
  COMPLIANCE_REVIEWED: 'Compliance reviewed',
  COMPLIANCE_BLOCKED: 'Blocked by compliance',
  READY_FOR_REVIEW: 'Ready for review',
  OUTREACH_DRAFT_CREATED: 'Outreach draft created',
  OUTREACH_DRAFT_EDITED: 'Outreach draft edited',
  OUTREACH_DRAFT_REGENERATED: 'Outreach draft regenerated',
  OUTREACH_DRAFT_EXPORTED: 'Draft exported for manual sending',
  OUTBOUND_SEND_CONFIRMED: 'Operator confirmed the message was sent',
  OUTBOUND_SEND_FAILED: 'The sender could not transmit the message',
  OUTBOUND_MESSAGE_SENT: 'Message sent manually from Zoho',
  AWAITING_REPLY: 'Awaiting reply',
  INBOUND_REPLY: 'Reply received',
  REPLY_ANALYZED: 'Reply analyzed',
  REPLY_DRAFT_CREATED: 'Reply draft created',
  REPLY_DRAFT_EXPORTED: 'Reply draft exported for manual sending',
  MANUAL_REPLY_SENT: 'Reply sent manually from Zoho',
  MEETING_BOOKED: 'Meeting booked',
  PROPOSAL_SENT: 'Proposal sent',
  WON: 'Won',
  LOST: 'Lost',
  DO_NOT_CONTACT: 'Marked do not contact',
  UNSUBSCRIBED: 'Unsubscribed',
  BOUNCED: 'Bounced',
  COMPLAINT: 'Complaint received',
  SUPPRESSED: 'Suppressed',
  SUPPRESSION_REMOVED: 'Suppression removed',
  STAGE_CHANGED: 'Stage changed',
  HELD: 'Put on hold',
  RESUMED: 'Resumed',
  ARCHIVED: 'Archived',
  NOTE_ADDED: 'Note added',
  TRACKED_LINK_CLICKED: 'Tracked link clicked',
  WEBSITE_CONTACT_CONVERSION: 'Submitted the website contact form',
  USAGE_LIMIT_REACHED: 'Usage limit reached',
  JOB_FAILED: 'Background job failed',
  JOB_DEAD_LETTERED: 'Background job gave up',
  MAILBOX_SYNC_FAILED: 'Mailbox synchronization failed',
})
