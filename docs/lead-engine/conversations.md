# Conversations

Code: `src/lead-engine/zoho/threadMatch.js` (matching), `zoho/normalize.js`
(parsing), `services/mailboxSync.js` (import),
`services/replyCopilot.js` (analysis and reply drafts),
`repositories/conversations.js` (storage). Tables: `lead_conversations`,
`lead_messages`.

## Thread matching: strong identifiers first

`matchMessageToConversation()` tries four strategies in a fixed order and stops at
the first that succeeds. The ordering **is** the design.

| # | Strategy | `strategy` value | Uses |
|---|---|---|---|
| 1 | Provider thread id | `provider_thread_id` | Zoho's `threadId` / `conversationId` against `lead_conversations.provider_thread_id` |
| 2 | RFC 5322 headers | `message_id_headers` | `In-Reply-To` + every id in `References`, against `lead_messages.internet_message_id` |
| 3 | Known contact address | `contact_address` or `contact_address_stale` | The counterpart address against `lead_contacts.email` |
| 4 | — | `no_match` | Nothing. The message is not ours and is left alone. |

The function is **pure**: every lookup is injected by `mailboxSync.js`, so the
matching logic is exhaustively testable without a database.

### 1. Provider thread id

The strongest signal available, when the provider exposes one. Zoho's own
threading has already done the work; trusting it is both correct and free.

### 2. RFC 5322 headers

`In-Reply-To` is the direct parent. `References` carries the whole ancestry, which
still matches when a client drops `In-Reply-To` — and clients do.

`parseMessageIdList` extracts the bracketed `<...>` forms with a regex rather than
splitting on whitespace, because real-world `References` headers contain commas,
newlines and stray text.

`normalizeMessageId` keeps the **angle brackets**, because that is how mail
systems write them and stripping them in one place and not another is how two
spellings of the same id stop matching. A bare `abc@example.com` is wrapped;
anything without an `@` returns null.

### 3. Known contact address

The fallback that **makes manual sends detectable**. An operator composing a
fresh message in Zoho produces no thread we have seen, but the recipient is a
contact we recorded.

`counterpartAddresses()` picks the right side of the message — the sender for an
inbound message, the recipients and CCs for an outbound one — and excludes our
own mailbox address.

`findContactsByEmail` orders by most recently updated lead first. The same address
can legitimately appear on two leads (two campaigns, one business), and the active
one is where a message almost certainly belongs.

#### The staleness flag

If a contact matches but the conversation's `last_message_at` is more than
`TIME_PROXIMITY_DAYS` (**45**) away from the message timestamp, the strategy is
reported as `contact_address_stale` rather than `contact_address`. A contact match
on a conversation silent for months is weak evidence — matched, attached to the
lead, but flagged.

`withinTimeProximity` returns **true** when either timestamp is missing or
unparseable. An absent timestamp is not evidence of staleness, and treating it as
such would flag every freshly-created conversation.

## Subject never decides a match on its own

There is no subject-matching strategy. Not as a tiebreaker, not as a fallback,
not weighted alongside anything else.

Two prospects can both reply *"Re: Quick question about your intake process"* to
two different threads. Attributing one business's reply to another business's lead
is the worst failure this module can produce: it would put a stranger's words on a
lead record, show them to the operator as that lead's reply, and then generate a
suggested response that **quotes them** — which the operator could then send to
the wrong company.

Subject is stored (`lead_messages.subject`, `lead_conversations.subject`) and
displayed. It is never evidence of identity.

A message that matches nothing is left entirely alone. Its body is never fetched.
That is the correct outcome for the large majority of mail in a real mailbox.

## Message immutability

`lead_messages` rows are **immutable once written.** The mailbox sync only ever
INSERTs, and nothing in the application updates a message body.

The reason is simple: the conversation view is a record of what was actually
said. A body that could be rewritten is not a record.

Three columns are written *about* a message after the fact —
`classification` (the deterministic opt-out kind), `ai_summary` and `ai_intent`
(`attachMessageAnalysis`). Those are commentary, clearly separated from
`body_text`, and none of them changes what was said.

### The idempotency mechanism

```sql
CREATE UNIQUE INDEX idx_lead_messages_provider
  ON lead_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
```

This is what makes mailbox sync safe to re-run. `recordMessage` returns
`{ created: false }` for a message already present, and the sync `continue`s
without doing any downstream work.

It is also what lets the sync **deliberately** re-read an overlapping 10-minute
window on every run, which is how a message that arrived mid-read is not skipped
forever.

### What is stored, and what is not

| Stored | Not stored |
|---|---|
| Plain text body, quoted history stripped, ≤ 20 000 chars | Raw MIME |
| `body_truncated` flag | HTML parts |
| From/to/cc addresses (normalized), from name | Attachments (only a `hasAttachment` boolean is parsed, and it is not persisted) |
| Subject (≤ 500 chars) | Inline images |
| `Message-ID`, `In-Reply-To`, `References` | |
| Provider message id, thread id, folder | |
| `received_at` / `sent_at` | |

Storing full MIME would keep more personal data than the purpose requires. The
reply copilot reads text.

Quoted history is stripped for two reasons: the conversation view already holds
every previous message, and a model asked to analyse a reply will otherwise spend
its context on our own earlier email — and sometimes answer *that* instead of the
new message.

`extractPlainBody` cuts at the **earliest** recognized reply separator, and is
conservative: if the cut would leave nothing, the original is kept. A top-posted
reply whose separator happens to appear in the first line is better analysed in
full than analysed as an empty string.

### Address parsing

`parseAddressList` splits on commas that are **not** inside quotes or angle
brackets. Zoho returns lists like
`Jane Doe <jane@acme.com>, info@acme.com`, and splitting on commas alone would
break a display name containing one. Each part goes through `normalizeEmail`.

`parseDisplayName` extracts `Jane Doe` from `Jane Doe <jane@acme.com>`.

## Conversation lifecycle

`lead_conversations.status`:

| Status | Set when |
|---|---|
| `open` | Created by `ensureConversation` |
| `awaiting_reply` | An outbound message was detected in Sent |
| `needs_attention` | An inbound reply arrived and has not been handled |
| `resolved` | Operator |
| `closed` | An opt-out was detected, or the operator closed it |

`makeLeadConversationLookup` deliberately excludes `closed` conversations when
falling back to "find this lead's conversation", so a reply after an opt-out does
not reopen a closed thread.

A conversation is created lazily — by `pushDraftToZoho` when the first draft is
saved, or by the sync when a matched message has no conversation yet.

## The reply copilot

`services/replyCopilot.js`. **A copilot, not an agent.** It reads, it summarizes,
it drafts — and then it stops. Nothing here sends, schedules a send, or marks a
conversation resolved.

### `analyzeReply(env, messageId)`

1. Refuses a non-inbound message.
2. **Re-runs deterministic opt-out detection** and returns
   `{ status: 'skipped', reason: 'opt_out_detected' }` if it fires. The sync
   already did this, and a message that tripped it never reaches here through the
   normal path — but this function is also reachable from a manual "analyse now"
   action, and the check is one string scan. The deterministic decision always
   wins; the model is never asked.
3. Builds `buildReplyContext` — company, opportunity, the last 6 messages
   **excluding the one being analysed**, and the new message separately. A model
   shown the same text twice tends to summarize the history rather than answer
   about the new message.
4. Runs `reply_analysis.v1`, schema-validated.
5. Writes `classification`, `ai_summary`, `ai_intent` onto the message and a
   `REPLY_ANALYZED` activity row (deduped on `reply_analyzed:<messageId>`).
6. Applies a suggested stage **only** if it is one of `CONVERSATION`, `MEETING`,
   `PROPOSAL`, `NOT_INTERESTED`, `HOLD`. A model must not be able to move a lead
   into or out of a suppression state.

Output fields: `intent` (10 values), `summary`, `question_type`,
`questions_detected[]`, `important_new_information`, `recommended_action`
(8 values), `needs_human_attention`, `suggested_pipeline_stage`,
`recommended_strategy`.

### `generateReplyDraft(env, messageId)`

1. **Suppression is a hard boundary for a reply too.** A suppressed sender returns
   `{ status: 'blocked' }` and no draft is written.
2. Requires a successful prior analysis — `not_ready` otherwise. There is nothing
   to draft from without knowing what was asked.
3. Runs `reply_draft.v1`, schema-validated, then through the invention guard.
4. Writes a `kind: 'reply'` draft with `in_reply_to_message_id` set, which is what
   lets `pushDraftToZoho` supply the `inReplyTo` header so the operator's manual
   send lands in the existing thread and the Sent sync can match it back.

### `processInboundReply(env, messageId)` — what the queue runs

Analyse, then draft. Sequential and short-circuiting.

It **stops after the analysis** when `needs_human_attention` is true. Drafting a
confident reply on top of stated uncertainty is exactly the wrong response to
uncertainty, so the operator writes that one themselves.

The prompt sets `needs_human_attention` for anything involving a complaint, a
legal or privacy question, a contractual question, or an unclear request.

### Operator screens

| Screen | Purpose |
|---|---|
| `/admin/lead-crm/replies` | Unanswered inbound replies, the analysis, the suggested response, regeneration variants, and lead actions |
| `/admin/lead-crm/conversations` | Full thread view per lead |

Reply-specific regeneration variants are in `replyDraft.v1.js`
`VARIANT_INSTRUCTIONS`: `shorter`, `more_technical`, `explain_solution`, and the
shared ones. They live in the versioned prompt file rather than the component, so
the exact wording behind a button is version-controlled.

## What can go wrong, and how it shows

| Failure | Symptom | Where to look |
|---|---|---|
| Zoho exposes no thread id and no `Message-ID` headers | Every match falls through to `contact_address`; threads still work but replies to a *forwarded* copy may miss | `lead_messages.internet_message_id` all null |
| A prospect replies from a different address | `no_match` — the reply is never imported | Nothing in the CRM; it sits in Zoho unread by the engine. Add the address as a contact on the lead. |
| Two leads share a contact address | Matched to the most recently updated lead | `strategy` on the log line; the activity timeline of both leads |
| A reply arrives months later | `contact_address_stale` | Matched and attached, flagged for a human |
| A body cannot be fetched | Header row stored with an empty body | `message_body_fetch_failed` log line |
| A body is over 20 000 chars | `body_truncated = 1` | The conversation view; open Zoho for the rest |
