# Workers AI

Code: `src/lead-engine/ai/` — `client.js`, `schemas.js`, `validate.js`,
`payload.js`, `prompts/*.js`. Configuration: `AI` in `config/defaults.js`.
Audit: `lead_ai_runs`.

## What the model is and is not for

The model does **one** thing this engine could not do deterministically: judge
whether a set of observed facts adds up to an opportunity worth a conversation,
and write a first draft of how to say so.

It does **not** read websites, extract signals, compute scores, decide
compliance, detect opt-outs, or send anything. All of that is code, because code
is reproducible, explainable and free.

Model: `@cf/meta/llama-3.1-8b-instruct-fp8`. The same model the Insights digest
uses, and for the same reason: it is in this account's `wrangler ai models list`.
The unquantized variant is not, and answers in a different response shape.

## Gating

The model is behind four gates, all of which must pass.

1. **`LEAD_AI_ENABLED`** (ANDed with `LEAD_ENGINE_ENABLED`). `assertFlag(env, 'ai')`
   throws `FeatureDisabledError` → HTTP 503 naming the exact var to set.
2. **The deterministic score routed the lead to AI** — `routesToAi(routing)`,
   which means a total of 60 or more. The model sees a few dozen businesses a day
   that already look plausible, rather than every domain a directory returned.
   This is the cost control and the quality control at once.
3. **The global daily budget** — `USAGE_LIMITS.ai_reviews` = 60/day, consumed
   atomically before the call.
4. **The campaign's own ceiling** — `lead_campaigns.max_ai_reviews` (40 for
   Campaign 001), counted as a separate per-campaign counter so one campaign
   cannot consume the day's whole allowance.

A budget refusal is **not a failure**. It writes a `USAGE_LIMIT_REACHED` activity
row, returns `{ status: 'deferred' }`, and `handlers.js` re-enqueues the job with
`delaySeconds: 6 * 60 * 60` and a date-stamped dedupe key — so it is retried
tomorrow rather than retried into the same wall.

`env.AI` missing at all returns `status: 'skipped'` without consuming anything.

## The four tasks

| Task | Prompt version | Max tokens | Temperature | Schema |
|---|---|---:|---:|---|
| `opportunity_review` | `opportunity_review.v1` | 700 | 0.1 | `opportunityReviewSchema` |
| `outreach_draft` | `outreach_draft.v1` | 500 | 0.4 | `outreachDraftSchema` |
| `reply_analysis` | `reply_analysis.v1` | 600 | 0.1 | `replyAnalysisSchema` |
| `reply_draft` | `reply_draft.v1` | 500 | 0.4 | `replyDraftSchema` |

Temperature 0.1 for the two judgement tasks, 0.4 for the two writing tasks. A
judgement that varies run to run is not a judgement.

### Prompt versioning

Prompts live in `src/lead-engine/ai/prompts/<task>.v1.js`, in Git, each exporting
`PROMPT_VERSION`, `SYSTEM_PROMPT` and `buildUserPrompt`. Every `lead_ai_runs` row
records `prompt_version`.

**Changing the wording means adding a `v2` file, not editing the `v1` one.** An
edited prompt silently invalidates every historical run that claims to have used
it. A result whose prompt cannot be reconstructed is not auditable, which is also
why prompts are never inlined into UI or route code.

The regeneration variants (`shorter`, `more_technical`, `suggest_call`, `no_cta`,
`regenerate`, `explain_solution`) are `VARIANT_INSTRUCTIONS` in the same prompt
files, for the same reason: the exact wording behind every "Make Shorter" button
press is version-controlled alongside the base prompt, not in the component that
renders the button.

### `opportunity_review.v1`

Two properties this prompt exists to enforce:

1. **Observation vs inference.** "Their sales team manually processes every
   inquiry" is a claim about the inside of a business we have never seen. "The
   public website asks visitors to call the office" is an observation. The schema
   has separate `observed_problem` and `inference_notes` fields, the prompt is
   explicit about the difference, and the lead detail screen renders them
   differently — so a human can see which is which before repeating it in an
   email.
2. **Prompt-injection fencing.** The payload contains text lifted from a third
   party's website. Anyone who can put words on a web page can attempt an
   injection. The payload is fenced in `<<<LEAD>>>` / `<<<END>>>` markers and the
   system prompt states that everything inside is quoted material to be treated
   strictly as data.

It also instructs: *"Set qualified to false when the research does not support a
specific, concrete opportunity. A low-quality or generic answer is worse than an
honest false. Do not invent a problem to justify qualifying."*

### `outreach_draft.v1`

The named prohibitions are the things a small model reliably invents when asked
to write B2B outreach: prices, percentages, named clients, and confident claims
about the recipient's internal systems. The prompt forbids stating or implying a
price, citing any metric or result, naming a past client or case study, claiming
knowledge of internal processes, claiming an undetected tool is in use, inventing
an award or certification, inventing a prior conversation or referral, and
including any link not supplied in the brief.

Format requirements: 90–140 words, plain sentences, open with something specific
and verifiable from the research, one hedged sentence on the possible
opportunity, one low-commitment closing question, sign off with the configured
sender name.

### `reply_analysis.v1`

Runs **only after** deterministic opt-out detection. That ordering is
architectural: an unsubscribe request is acted on by code that cannot be talked
out of it, and the model's later summary is commentary on a decision already
made. A model asked to classify "please remove me" will usually get it right —
but "usually" is not the standard for that particular message.

The inbound message is quoted content written by someone who knows an automated
system may read it, so the injection fencing matters more here than anywhere
else. The prompt tells the model to ignore anything that looks like an
instruction **and to note its presence in the summary**.

It must set `needs_human_attention: true` for anything involving a complaint, a
legal or privacy question, a contractual question, or an unclear request.

### `reply_draft.v1`

Tighter prohibitions than initial outreach, because a reply is where commitments
get made. A prospect asking "can you integrate with HubSpot?" will read "yes, we
support HubSpot" as a statement of fact about a product, and a model has no way
to know whether it is true.

So: describe the **approach**, never confirm a capability the brief does not
assert; if you do not know, say it depends and name what you would need to know;
no price, no timeline, no metric, no past client, no agreement to contractual,
legal or data-processing terms.

## Payload minimization

`src/lead-engine/ai/payload.js`. **Full website HTML is never sent.** Three
reasons, in order of how much they matter:

1. A page of HTML is mostly markup the model cannot use and would be charged for.
2. Raw page text is the highest-risk prompt-injection surface in the system.
3. A model given a whole page will summarize the page rather than answer the
   question it was asked.

What goes instead is an explicit **allow-list**. If a field is not named in
`payload.js`, the model does not see it.

| Builder | Contains | Bounds |
|---|---|---|
| `buildOpportunityPayload` | company name/website/industry/location, campaign target industry and description, detected technology, page URLs and titles, detected signal **labels**, evidence quotes, the four score subtotals | 30 signals, 8 evidence items @ 240 chars, 4 page summaries, 12 technologies, 300-char campaign description, 120-char titles |
| `buildOutreachBrief` | company facts, recipient **address type** only, opportunity fields, evidence, sender identity, capabilities, allowed links | 400/300 chars per opportunity field, 8 evidence items |
| `buildReplyContext` | company, opportunity summary, last 6 messages, the new message | 1500 chars per historical body, 3000 for the new message |
| `buildReplyBrief` | company, opportunity, the analysis, last 4 messages, thread subject, sender, capabilities | 1200 chars per body |

Two details worth noting:

- **The recipient's email address is not sent.** Only whether it is a `role`,
  `named` or `generic` address, which is all that affects the greeting.
- **Signal labels, not keys.** The model reads "Public pages describe a manual
  intake step" better than `MANUAL_WORKFLOW_LANGUAGE`, and the label is already
  the operator-facing wording.
- **Brave search snippets are never forwarded.** The model reasons only over
  pages this system fetched itself.
- Reply context is bounded to the recent conversation rather than its whole
  history: a long thread would push the new message far down a small model's
  context, and the question being asked is about the new message.
  `analyzeReply` additionally **excludes the message being analysed** from the
  history it sends, because a model shown the same text twice tends to summarize
  the history instead of answering.

## Output validation

Two separate layers. Keeping them separate matters, because the shape is
machine-checkable in a way the content is not, and conflating them would hide the
fact that the second layer is heuristic.

### Layer 1: schema (`ai/schemas.js`)

Zod schemas for all four tasks. A small instruction-tuned model will, given the
chance, return prose around its JSON, invent an enum value, return a confidence
of `"high"` instead of `0.8`, or answer a different question — and each of those,
stored unvalidated, becomes a claim about a real business on a screen a human
then acts on.

- `extractJson` recovers JSON from a markdown fence, or by slicing between the
  first `{` and the last `}`. It **never repairs** the JSON itself — a "fixed"
  answer is no longer the model's answer.
- `confidence` is coerced from a numeric **string** (`"0.8"` → `0.8`) because
  small models return that about as often as a number. A **word** like `"high"`
  is *not* coerced: there is no defensible mapping, and inventing one would put a
  number on the screen the model never gave.
- Every free-text field has a character ceiling.
- Enums are closed: `OPPORTUNITY_TYPES` (9), `DEVLAB_SERVICES` (6),
  `REPLY_INTENTS` (10), `RECOMMENDED_ACTIONS` (8).

**The `outreachDraftSchema` has no pricing field, no metrics field and no
case-study field.** The schema is part of the enforcement: a model that writes
"we cut costs 40% for a similar firm" has nowhere to put it.

Retry policy: `AI.maxParseRetries = 1`. One retry, with a stronger reminder
appended **as a user turn** (so the versioned prompt text stays exactly what the
audit record says it was). One and not a loop, because a small model that answered
in prose once will usually correct itself when told to, and will rarely correct
itself on a third attempt — further retries mostly buy neuron spend.

Failure is recorded as `status: 'invalid_output'` with `raw_output` retained
(bounded to 2000 chars), and **the lead stays where it was**. A model that cannot
answer is a lead that does not get reviewed, which is strictly better than a lead
reviewed with fabricated content.

### Layer 2: the invention guard (`ai/validate.js`)

Proves the model did not *write the things it was told not to write*. Applied to
`outreach_draft` and `reply_draft` output.

| Code | Catches |
|---|---|
| `PRICE_CLAIM` | Currency figures, "starting at", "per hour", "flat fee", "retainer of" |
| `METRIC_CLAIM` | Percentages, "3x", "saved/cut/reduced/increased … 40" |
| `CLIENT_CLAIM` | "one of our clients", "a similar firm", "case study", "we helped … achieve" |
| `INTERNAL_KNOWLEDGE_CLAIM` | "your team manually processes", "I know your team is", "you're currently using X" |
| `TIMELINE_COMMITMENT` | "we can deliver", "ready in 3 weeks", "guaranteed by" |
| `FALSE_PRETEXT` | "as we discussed", "following up on our call", "X suggested I reach out", "you signed up" |
| `CREDENTIAL_CLAIM` | "award-winning", "certified partner", "ISO 9001", "#1 rated" |
| `DISALLOWED_LINK` | Any URL not in the brief's `allowed_links`, compared by normalized URL rather than substring |
| `UNSUPPORTED_OBSERVATION` | A `referenced_observations` entry with no supporting extracted signal |

`findUnsupportedObservations` uses **word overlap**, not exact matching: the model
paraphrases, and requiring a literal quote would reject every honest draft. A
one- or two-word claim must match entirely; anything longer needs two meaningful
words in common. A deliberately forgiving bar, because this is a backstop behind
human review and a false positive costs a regeneration on a draft that was fine.

The patterns are **tuned toward catching real violations over avoiding false
positives**, because a false positive costs one regeneration and a false negative
costs a false statement sent to a stranger.

#### What happens on a violation — and what does not

**A tripped draft is not silently rewritten.** It is stored with the violations
attached to the `OUTREACH_DRAFT_CREATED` / `REPLY_DRAFT_CREATED` activity
metadata and returned in the API response as `violations[]`, so the human
reviewing it sees exactly what the model claimed.

That is the honest outcome: a person is going to read every one of these before
sending it, and the worst thing this layer could do is quietly launder a false
claim into something that looks clean.

> **Note on a comment/behaviour mismatch.** The module comment in `validate.js`
> says a tripped draft "is rejected and regenerated once, and if it trips again
> the draft is stored with the violations attached". **There is no automatic
> regeneration in the code.** `services/outreach.js` and
> `services/replyCopilot.js` call `validateGeneratedMessage` once and store the
> draft with its violations regardless. Regeneration is an operator action (the
> "Regenerate" buttons). The stored-with-violations behaviour is real; the
> auto-retry is not.

## The opt-out line

After validation, `services/outreach.js` appends the reply-with-`STOP`
instruction if `messageContainsOptOutInstruction(body)` is false. The model is not
asked to write it — it is generated deterministically from
`business.identity.senderEmail` by `compliance/optOut.js`. See
[compliance.md](compliance.md).

## The audit ledger

`lead_ai_runs` records **every** call, successful or not. It is the cost ledger,
the prompt-version record and the debugging trail in one table.

| Column | Meaning |
|---|---|
| `task` | One of the four |
| `model`, `prompt_version` | Exactly what produced it |
| `status` | `ok` \| `invalid_output` \| `failed` \| `skipped` |
| `result_json` | Schema-validated output. `NULL` unless `ok`. |
| `confidence` | Denormalized for filtering |
| `raw_output` | **Only** when validation rejected the answer |
| `error_message` | The reason, including the first 300 chars of zod issues |
| `input_tokens`, `output_tokens`, `neurons` | Usage, when reported |
| `duration_ms` | Wall clock across all attempts |
| `lead_id`, `conversation_id`, `message_id` | What it was about |

Usage is **accumulated across retry attempts** — a retry costs real neurons and
the cost screen must show them.

`getTodayAiSpend` feeds the dashboard's `usage.ai` panel.

## Honest notes on cost measurement

**Neuron measurement is advisory, not authoritative.**

`readUsage()` reads `usage.neurons`, `usage.prompt_tokens`/`input_tokens` and
`usage.completion_tokens`/`output_tokens` from the response, and **every field is
optional**. Workers AI models do not all report usage, and a model that reports
none leaves `neurons` `NULL` on the run row.

The consequence, stated plainly:

- `USAGE_LIMITS.ai_neurons` (5000/day) bounds **what we can measure, not what we
  can spend.** If the model stops reporting neurons, that counter stops moving
  while real neurons continue to be consumed.
- The **authoritative** budget is `ai_reviews` — a **count** of calls, which does
  not depend on the model volunteering anything. That is the number to tune if
  you want to control spend.
- Cloudflare's own dashboard is the authority on actual neuron consumption.
  `lead_ai_runs` is a local estimate.

`config/defaults.js` says this in a comment on `ai_neurons`, and `client.js` says
"usage is telemetry for the cost screen, never control flow".

## The response-shape trap

`readText()` in `client.js` tries six candidate paths: `result` as a bare string,
`result.response`, `result.choices[0].message.content`, `result.choices[0].text`,
and the `result.result.*` nestings of the last three.

This is not defensive over-engineering. Workers AI models do not agree on a
response shape, and the binding returns the payload unwrapped while the REST API
nests it under `result` — reading only one of these makes a **working** model look
exactly like a broken one. The Insights digest shipped with that bug and spent a
day's neuron allocation producing summaries it then discarded.

## What happens when the model fails

| Situation | Result |
|---|---|
| `env.AI` absent | `skipped`; lead unchanged |
| Daily/campaign budget spent | `deferred`; `USAGE_LIMIT_REACHED` activity; job re-enqueued for +6h |
| `env.AI.run` throws (allocation exhausted) | `failed`; lead → `HOLD` with `AI_FAILED` |
| Unparseable/schema-violating answer after one retry | `invalid_output` with `raw_output` kept; lead → `HOLD` |
| Valid answer, `qualified: false` | Lead → `NOT_QUALIFIED` with the model's `reasoning_summary` |
| Valid answer, confidence < 0.6 | Lead → `NOT_QUALIFIED`, summary names the threshold |
| Valid answer, qualified, contact exists | Lead → `AI_QUALIFIED` → `CONTACT_FOUND` |
| Valid answer, qualified, no contact | Lead → `AI_QUALIFIED` → `NO_CONTACT` (actionable) |

A model failure puts the lead on **`HOLD` for a human**, not `NOT_QUALIFIED` —
the deterministic rules already said it was worth looking at, and the model's
inability to answer is not evidence against the lead.

## What the model may and may not change

`services/replyCopilot.js` applies an AI-suggested pipeline stage **only** if it
is one of `CONVERSATION`, `MEETING`, `PROPOSAL`, `NOT_INTERESTED`, `HOLD`.

A model must not be able to move a lead into or out of a suppression state. Those
transitions belong to the deterministic path alone, and the compliance-terminal
one-way door in `canTransition` would refuse it anyway.

`processInboundReply` also **stops** rather than drafting when the analysis set
`needs_human_attention: true`. Drafting a confident reply on top of stated
uncertainty is exactly the wrong response to uncertainty.
