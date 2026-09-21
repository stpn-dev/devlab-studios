# Pipeline

Defined in `src/lead-engine/domain/pipeline.js` and mirrored by a `CHECK`
constraint on `lead_leads.stage` in `migrations/0012`. A unit test asserts the two
lists match — a stage the application believes in and the database rejects is a
write that fails at 3am rather than in CI.

## The 24 stages

### Progression (`PROGRESSION_STAGES`, in order)

| Stage | Label | Set by |
|---|---|---|
| `DISCOVERED` | Discovered | `services/discovery.js` on admission |
| `RESEARCHING` | Researching | `services/research.js` at crawl start |
| `RESEARCHED` | Researched | `services/research.js` after signals extracted |
| `RULE_QUALIFIED` | Rule qualified | `stageForRouting` when the score routes to AI |
| `AI_REVIEW` | AI review | `services/aiReview.js` before the model call |
| `AI_QUALIFIED` | AI qualified | `services/aiReview.js` on a qualifying answer |
| `CONTACT_FOUND` | Contact found | `services/aiReview.js` when a contact exists |
| `READY_FOR_REVIEW` | Ready for review | `services/outreach.js` after a draft is generated |
| `READY_TO_CONTACT` | Ready to contact | `services/draftExport.js` after the draft is exported |
| `CONTACTED` | Contacted | **Only** `services/mailboxSync.js` on seeing the message in Sent |
| `AWAITING_REPLY` | Awaiting reply | `services/mailboxSync.js`, immediately after `CONTACTED` |
| `REPLIED` | Replied | `services/mailboxSync.js` on an inbound message |
| `CONVERSATION` | In conversation | Manual reply detected in Sent, or reply analysis |
| `MEETING` | Meeting | Operator, or reply analysis |
| `PROPOSAL` | Proposal | Operator, or reply analysis |
| `WON` | Won | Operator (`mark_won`) |

### Off-path and terminal

| Stage | Label | Terminal? | Compliance-terminal? |
|---|---|---|---|
| `LOST` | Lost | Yes | No |
| `NOT_QUALIFIED` | Not qualified | Yes | No |
| `HOLD` | Hold | No | No |
| `NO_CONTACT` | No contact found | Yes | No |
| `DO_NOT_CONTACT` | Do not contact | Yes | **Yes** |
| `UNSUBSCRIBED` | Unsubscribed | Yes | **Yes** |
| `BOUNCED` | Bounced | Yes | **Yes** |
| `NOT_INTERESTED` | Not interested | Yes | No |
| `ARCHIVED` | Archived | Yes | No |

`TERMINAL_STAGES` means "the engine generates no further outreach and schedules
no further work". A lead there is finished with, one way or another.

`ACTIONABLE_STAGES` — `READY_FOR_REVIEW`, `READY_TO_CONTACT`, `REPLIED`, `HOLD`
— are the stages where a human is expected to do something. They drive the
dashboard's work queue.

## Transitions are not a matrix

`canTransition(from, to, options)` is deliberately permissive. It refuses exactly
three things:

1. **An unknown stage.** The database would reject it anyway, but a usable error
   message is better than a constraint violation.
2. **Leaving a compliance-terminal stage** (see below).
3. **A no-op** (`from === to`), so the activity timeline is not filled with
   transitions that did not happen.

Everything else is allowed. The pipeline is non-linear by design: a lead can go
from `RESEARCHED` straight to `DO_NOT_CONTACT`, from `READY_TO_CONTACT` back to
`HOLD`, or from anywhere to `ARCHIVED`. Encoding a transition matrix in SQL would
make legitimate jumps impossible while catching nothing the application layer
does not already check.

`transitionLead` (`repositories/leads.js`) returns `{ moved: false, reason }`
rather than throwing when a transition is refused, because most callers are
background jobs for which "already terminal" is an ordinary outcome. Routes that
need it to be an error check `moved`.

The stage write and the activity row are a **single D1 batch**. The failure mode
of two separate writes is an audit trail that lies.

## The compliance-terminal one-way door

```
DO_NOT_CONTACT   ┐
UNSUBSCRIBED     ├──  no transition out, at all, by anything
BOUNCED          ┘
```

A lead in one of these arrived there because a person objected, an address
bounced, or an operator said no. **The engine is not permitted to move it back
out.** `canTransition` returns:

> `A lead in <label> cannot be moved. Remove the suppression entry first.`

The only escape is `allowComplianceOverride: true`, which is threaded through
`transitionLead`'s options and is intended for the privileged
suppression-removal path — itself audited and reason-required
(`repositories/suppression.js` `removeSuppression` rejects a reason shorter than
three characters and never hard-deletes the row).

This makes "unsubscribe means unsubscribed" **structural** rather than a
convention each call site has to remember. A model cannot undo it: in
`services/replyCopilot.js`, an AI-suggested stage is applied only if it is in
`[CONVERSATION, MEETING, PROPOSAL, NOT_INTERESTED, HOLD]`, and deterministic
opt-out detection runs before the model is asked anything at all.

Note the asymmetry: `HOLD` and `NOT_INTERESTED` are *not* compliance-terminal.
A lead on hold can be resumed; a lead that said "not right now" can be picked up
later. `NOT_QUALIFIED` and `ARCHIVED` are terminal but not compliance-terminal,
so an operator can move them if they decide the rules got it wrong.

## `describeNextAction`

Centralized in `domain/pipeline.js` rather than computed in the UI, so the leads
table, the lead detail screen and the dashboard cards cannot disagree about what
a lead needs. It returns `null` when the *engine* is what acts next, which the UI
renders as "waiting on the engine" rather than prompting a human.

An unanswered reply short-circuits everything else.

| Stage | Next action |
|---|---|
| any, with an unanswered reply | Review the reply and create a Zoho reply draft. |
| `DISCOVERED`, `RESEARCHING`, `RESEARCHED`, `RULE_QUALIFIED`, `AI_REVIEW` | *(null — engine's turn)* |
| `AI_QUALIFIED` without a contact | No public business contact found yet — add one manually or reject. |
| `CONTACT_FOUND` needing compliance review | Complete the compliance review for this lead. |
| `READY_FOR_REVIEW` | Review the opportunity and the suggested outreach draft. |
| `READY_TO_CONTACT`, no draft | Generate an outreach draft. |
| `READY_TO_CONTACT`, no Zoho draft | Export the draft, then send it yourself from your mail client. |
| `READY_TO_CONTACT`, Zoho draft exists | Send it yourself, then mark the lead contacted. |
| `CONTACTED`, `AWAITING_REPLY` | *(null)* |
| `REPLIED` | Review the reply and the suggested response. |
| `CONVERSATION` | Continue the conversation in your own mail client. |
| `MEETING` | Hold the meeting and record the outcome. |
| `PROPOSAL` | Follow up on the proposal. |
| `HOLD` | Decide whether to resume or reject this lead. |
| `NO_CONTACT` | Add a public business contact manually, or archive. |

It is refreshed by `refreshNextAction(db, leadId)` at the end of every service
that changes a lead, and cached on `lead_leads.next_action`.

## The activity vocabulary

`src/lead-engine/domain/activity.js`. `recordActivity` rejects an event type not
listed there, so the vocabulary stays closed without the schema enforcing it.
Every entry has a human label in `ACTIVITY_LABELS`; an event without one falls
back to its own code.

### Discovery
`DISCOVERED` · `SOURCE_NORMALIZED` · `DUPLICATE_SKIPPED`

### Research
`CRAWL_STARTED` · `CRAWL_COMPLETED` · `CRAWL_FAILED` · `CRAWL_SKIPPED` ·
`BROWSER_RUN_USED` · `SIGNALS_EXTRACTED`

### Scoring
`RULE_SCORED` · `RULE_QUALIFIED` · `RULE_REJECTED`

### AI
`AI_REVIEW_STARTED` · `AI_QUALIFIED` · `AI_REJECTED` · `AI_FAILED`

### Contacts
`CONTACT_FOUND` · `CONTACT_MISSING` · `CONTACT_ADDED_MANUALLY`

### Compliance and review
`COMPLIANCE_REVIEWED` · `COMPLIANCE_BLOCKED` · `READY_FOR_REVIEW`

### Outreach
`OUTREACH_DRAFT_CREATED` · `OUTREACH_DRAFT_EDITED` · `OUTREACH_DRAFT_REGENERATED` ·
`OUTREACH_DRAFT_EXPORTED` ("Draft exported for manual sending") ·
`OUTBOUND_SEND_CONFIRMED` ("Operator confirmed the message was sent")

### Conversation
`OUTBOUND_MESSAGE_SENT` ("Message sent by hand") · `AWAITING_REPLY` ·
`INBOUND_REPLY` · `REPLY_ANALYZED` · `REPLY_DRAFT_CREATED` ·
`REPLY_DRAFT_EXPORTED` · `MANUAL_REPLY_SENT`

### Outcome
`MEETING_BOOKED` · `PROPOSAL_SENT` · `WON` · `LOST`

### Suppression
`DO_NOT_CONTACT` · `UNSUBSCRIBED` · `BOUNCED` · `COMPLAINT` · `SUPPRESSED` ·
`SUPPRESSION_REMOVED`

### Lifecycle
`STAGE_CHANGED` · `HELD` · `RESUMED` · `ARCHIVED` · `NOTE_ADDED`

### Tracking
`TRACKED_LINK_CLICKED` · `WEBSITE_CONTACT_CONVERSION`

### Operational
`USAGE_LIMIT_REACHED` · `JOB_FAILED` · `JOB_DEAD_LETTERED` · `MAILBOX_SYNC_FAILED`

Read the labels carefully: `OUTBOUND_MESSAGE_SENT` reads *"Message sent manually
from Zoho"*, and `ZOHO_DRAFT_CREATED` reads *"Saved to Zoho Drafts"*. The wording
is the point — the timeline never implies the software sent anything.

## Operator actions

`POST /api/admin/lead-crm/leads/:id/actions` supports:

| Action | Effect |
|---|---|
| `hold` | → `HOLD`, `HELD` |
| `resume` | → `RESEARCHED`, `RESUMED` |
| `reject` | → `NOT_QUALIFIED`, `RULE_REJECTED` |
| `archive` | → `ARCHIVED`, `ARCHIVED` |
| `do_not_contact` | → `DO_NOT_CONTACT` **and writes a suppression entry** |
| `mark_won` | → `WON` |
| `mark_lost` | → `LOST` |
| `set_priority` | Updates `lead_leads.priority` only |

`do_not_contact` does two things and both matter: the stage move makes it
compliance-terminal, and the suppression entry is what makes the decision stick
across campaigns and across the address being rediscovered later.
