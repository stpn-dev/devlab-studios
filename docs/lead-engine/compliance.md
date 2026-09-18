# Compliance

## Scope — read this before anything else

This subsystem provides **operational safeguards, provenance and auditability.**

**It is NOT a legal-decision engine.** It does not and cannot determine whether a
given message is lawful. It gives no legal advice. Neither the code nor any
screen it feeds may claim that outreach is legally compliant.

What it can honestly say is narrower and still useful:

> *"These configured checks were run against this lead. Here is which ones
> passed. Here is the evidence. Here is who reviewed it and when."*

A `state` of `passed` means **"every configured check we know how to run came
back clean"**. It does not mean the outreach is lawful. No screen, export or API
response derived from `evaluateCompliance()` may say that it does.

A profile is a **named set of checks, not a statute.** The key
`us-can-spam-operational` means *"the operational habits we keep in the US
market, informed by CAN-SPAM"* — it does not mean "CAN-SPAM compliant". The
naming is intentional and should not be shortened.

Getting a real answer for a real market means reading the law, or paying someone
who has. This system records what you decided and what it checked; it does not
decide for you.

### Manual sending is not treated as automatically exempt

A human pressing Send in a mail client is still commercial email, and it still
involves personal data. The checks below apply to a hand-written message exactly
as they apply to a generated one.

The engine drafts rather than sends for **operational** reasons — human judgement
in the loop, no send infrastructure to misconfigure, no automated blast to
regret. Drafting does not move the work outside the rules that apply to it, and
nothing in this codebase treats "a person sent it manually" as a reason to skip a
check.

This is stated in the module comments of `compliance/countryProfiles.js`,
`compliance/evaluate.js` and `compliance/optOut.js`, so it cannot be lost by
someone reading only the code.

## The check vocabulary

Defined once in `CHECK_DEFINITIONS` (`compliance/countryProfiles.js`) so a profile
*references* a check rather than restating it. Two markets needing the same check
get the same key, the same wording on screen, and the same evaluator — which is
what makes "why was this lead blocked" mean the same thing in every market.

| Key | Label | What it verifies |
|---|---|---|
| `recipient_not_suppressed` | Recipient is not suppressed | Neither the address nor its domain is in the suppression registry |
| `not_do_not_contact` | Lead is not marked do-not-contact | Stage is not `DO_NOT_CONTACT`, `UNSUBSCRIBED` or `NO_CONTACT` |
| `sender_identity_configured` | Sender identity is configured | `business.identity.senderName` and `senderEmail` are set |
| `postal_address_configured` | Business postal address is configured | `postalAddress`, `city`, `region`, `postalCode`, `countryCode` are all set |
| `contact_provenance_recorded` | Contact provenance is recorded | The contact has a `sourceUrl`, a `sourceType`, and `publishedPublicly === true` |
| `opt_out_mechanism_present` | Opt-out mechanism is present | An opt-out line can be produced, **and** — when a draft is attached — it is actually in the draft text |
| `legal_basis_recorded` | Legal basis for processing is recorded | A human wrote down which lawful basis this relies on |
| `privacy_review_recorded` | Privacy review is recorded | A named reviewer and a reference to an assessment held outside this system |
| `objection_handling_available` | Objection handling is available | A working route to object exists and lands in the suppression registry |
| `market_profile_configured` | A profile is configured for this market | **Never passes.** Its only purpose is to fail. |

Two of these are **hard boundaries** (`HARD_BOUNDARY_CHECK_KEYS`):
`recipient_not_suppressed` and `not_do_not_contact`. That distinction belongs to
the check itself rather than to the profile that uses it — suppression means the
same thing in every market, and no profile should be able to demote it to
"someone should look at this".

Note the honest wording on `legal_basis_recorded`: *"The system records the
assertion and who made it; it does not evaluate whether the basis is sound."*

## The two configured markets

### US — `us-can-spam-operational`

> Operational safeguards for US outreach, informed by CAN-SPAM: say honestly who
> is writing, show a real postal address, offer a working opt-out, honour it, and
> be able to show where the address came from. **Not a compliance certification.**

| Check | Required |
|---|---|
| `sender_identity_configured` | yes |
| `postal_address_configured` | yes |
| `contact_provenance_recorded` | yes |
| `opt_out_mechanism_present` | yes |
| `recipient_not_suppressed` | yes (hard) |
| `not_do_not_contact` | yes (hard) |

**Consequence you will hit immediately:** `business.identity` is seeded **empty**
(`scripts/lead-engine/seed.mjs`). So `sender_identity_configured` and
`postal_address_configured` both fail, and **every US lead sits at
`needs_human_review`** until an operator fills them in on
`/admin/lead-crm/settings`.

That is deliberate. The alternative would be the engine inventing a postal
address for a commercial email, which is worse than being blocked.

### PH — `ph-dpa-operational`

> Operational safeguards for Philippine outreach, informed by the Data Privacy
> Act: record a lawful basis and who asserted it, record a privacy review, keep
> provenance for every address, and give a working route to object. **Not a
> compliance certification.**

| Check | Required |
|---|---|
| `legal_basis_recorded` | yes |
| `privacy_review_recorded` | yes |
| `contact_provenance_recorded` | yes |
| `objection_handling_available` | yes |
| `recipient_not_suppressed` | yes (hard) |
| `not_do_not_contact` | yes (hard) |

`legal_basis` and `legal_basis_reference` are free text on
`lead_compliance_reviews`, filled in by a person at
`POST /api/admin/lead-crm/leads/:id/compliance`. They reference an assessment held
**outside this system**. Nothing here evaluates whether the basis is correct.

Every check in both profiles is `required: true` today. That is a real value, not
a placeholder: a check we would not act on is not worth recording. The field is
carried through to the stored evaluation so the lead detail screen can separate
"this blocked the lead" from "this is context".

Adding a market means adding one object to `MARKETS`. Adding a market does **not**
mean the market is understood; it means someone chose which checks to run there
and can be asked why.

## The default: human review, never silent pass

`getCountryProfile(code)` **never returns null**. An unconfigured market gets
`DEFAULT_COUNTRY_PROFILE` — `default-human-review`:

| Check | Required |
|---|---|
| `market_profile_configured` | yes — **and it always fails** |
| `recipient_not_suppressed` | yes (hard) |
| `not_do_not_contact` | yes (hard) |

It keeps the two hard boundaries and adds a check that cannot pass, so an
unconfigured market routes to a person instead of quietly passing.

**Silence about a market is not evidence that outreach there is fine.**

The fallback echoes back the requested country code (if it is a valid ISO-3166-1
alpha-2), so the stored evaluation records which market was actually being
considered, not just that it was unknown.

Returning a profile rather than null also means no caller can forget to handle
"no profile": the shape is always the same, and the unconfigured case expresses
itself as a check that fails rather than as an absent object someone has to
remember to test for.

## How evaluation works

`evaluateCompliance(input)` is **pure**. Configuration and already-fetched records
in, verdict out — no database access, no network, no clock. The caller fetches the
suppression result and the stored review and passes them in, which keeps the
function exhaustively testable (22 tests) and re-runnable over historical records.

### The state machine

```
any HARD boundary check failed  →  blocked
else any required check failed  →  needs_human_review
else                            →  passed
```

Hard boundary first: a suppressed recipient is `blocked` whatever else is wrong,
and "blocked" must not be downgraded to "someone should look at it" merely
because a configuration check also failed.

### `waived` cannot be computed

`evaluateCompliance()` **never** returns `waived`. Waiving is a human act with a
required written reason, and it lives in `repositories/compliance.js`. A function
that could compute its way to `waived` would make the one state that means "a
person accepted this risk" indistinguishable from a rule firing.

`isReadyForOutreachReview(evaluation)` returns true for `passed` **or** `waived`
and nothing else — including `pending`.

### A missing evaluator throws

If a profile references a check with no evaluator, `evaluateCompliance` throws.
Silently counting it as passing is the one outcome the module must never produce
by accident. A unit test asserts the two maps agree, so this is unreachable in
production.

### A missing suppression result fails

`recipient_not_suppressed` with no `suppression` input passed in returns
`passed: false` with *"Suppression was not checked before this evaluation ran."*
"We did not check" and "we checked and it was clean" must never collapse into the
same outcome for the one check that has no acceptable failure mode.

### Human decisions survive re-evaluation

`recordComplianceEvaluation()` deliberately does **not** overwrite a human
decision. Once a reviewer has set `waived` or recorded a legal basis, a later
automated re-evaluation records its checks but leaves the state alone. Otherwise
a routine re-run would quietly undo a considered human judgement.

Check details are written to be **actionable**: a blocked lead tells the reader
what to change, not that something is wrong. For example, *"Business postal
address is incomplete: postalCode, countryCode."*

## Suppression is a hard boundary

`lead_suppression`, `repositories/suppression.js`. See
[data-model.md](data-model.md) for the schema.

A match **stops outreach generation entirely**, and it is checked in three places:

| Where | Why |
|---|---|
| `checkOutreachReadiness()` — before draft generation | So no draft is ever written for a suppressed address |
| `pushDraftToZoho()` — at the moment of action | **Time passes between a screen rendering and a button being pressed.** A suppression entry added in between is exactly the case this catches. |
| `generateReplyDraft()` — before a reply is drafted | Someone who asked to be left alone does not get a suggested response drafted for them |

The redundancy is deliberate. This is the check that must not have a gap, and no
single missed call site can let a suppressed address through.

### Behaviour

- **Scope `email` or `domain`, checked in one query.** Checking only the exact
  address would let a domain-scoped suppression be bypassed by any address at
  that domain the engine had not yet discovered — which is the whole reason
  domain scope exists.
- **An unnormalizable address is treated as suppressed.**
  `checkSuppression` returns `{ suppressed: true, entry: null }` for anything
  `normalizeEmail` cannot read. Failing closed is the only defensible direction
  for this check.
- **The entry is returned, not just a boolean**, so the UI can say *why* a lead is
  blocked: *"Suppressed by domain (do not contact)."*
- **Adding is idempotent.** Suppressing an already-suppressed value returns the
  existing entry rather than failing — the inbound-reply handler may legitimately
  see the same "remove me" message twice.
- **Removal is privileged and audited.** `removeSuppression` requires an actor and
  a reason of at least three characters, and never hard-deletes: it sets
  `removed_at` / `removed_by` / `removal_reason`. The partial unique index allows
  any number of removed rows for the same value alongside one active row, so
  "we suppressed this, then someone unsuppressed it" is a readable history.
- **Removal is the only thing that unlocks a compliance-terminal lead.** The stage
  cannot be left otherwise — see [pipeline.md](pipeline.md).

Reasons: `unsubscribe` · `do_not_contact` · `hard_bounce` · `complaint` ·
`manual_block` · `existing_client` · `competitor` · `other`.
Sources: `manual` · `inbound_reply` · `bounce` · `import` · `system`.

Operator screen: `/admin/lead-crm/suppression`.

## Opt-out detection runs before any AI

`compliance/optOut.js`. `detectOptOut()` is **pure string matching with no model
in the path**, and it runs *before* any AI step on an inbound message
(`services/mailboxSync.js` calls it immediately after the body is fetched, before
anything is stored or analysed).

**Its decision cannot be reversed by a model.** No prompt, no classification and
no confidence score anywhere in this system is permitted to turn a detected
opt-out back into "keep emailing them". A model that disagreed with this function
would still lose, by construction:

- `handleInboundMessage` suppresses, moves the lead to a compliance-terminal
  stage, closes the conversation, and **returns without queuing any AI analysis**.
  There is nothing for a model to add, and asking it would only create the
  possibility of it disagreeing.
- `analyzeReply()` re-runs the check and returns
  `{ status: 'skipped', reason: 'opt_out_detected' }` — because that path is also
  reachable from a manual "analyse now" action, and the check is one string scan.
- `canTransition` refuses to move a lead out of `DO_NOT_CONTACT`, `UNSUBSCRIBED`
  or `BOUNCED`.

The only thing that undoes an opt-out is a human removing the suppression entry.

### Which way it fails, and why that is right

This check **fails safe — toward suppressing.**

| | Cost |
|---|---|
| False positive | One lead. We stop emailing someone who was not asking us to. A person can undo it. |
| False negative | We keep emailing someone who asked us to stop. Invisible until it becomes a complaint. **Not undoable.** |

The asymmetry is not close, so the phrase list leans inclusive and the negation
guard is narrow.

### The patterns

Evaluated in order of severity, most severe first, because "this is spam,
unsubscribe me" is a **complaint** that also happens to contain an unsubscribe
request — recording it as a plain unsubscribe would understate what happened.

| Kind | Examples |
|---|---|
| `complaint` | "this is spam", "reported you as spam", "spam complaint", "filing a complaint" |
| `do_not_contact` | "do not contact me", "don't email us", "never contact me", "stop emailing me", "stop sending me", "lose my email" |
| `unsubscribe` | "unsubscribe", "opt out", "opt me out", "remove me", "take me off", "no longer wish to receive", "please stop" |

Plus a **bare `STOP` line** — matched as a whole line (`^\s*stop[\s.!]*$`) rather
than as a word, because "stop" inside a sentence usually is not a request ("we
had to stop using them") while a line containing only STOP is unambiguous and is
precisely what our own instruction asked for.

Imperative and first-person forms are preferred over bare nouns. The one bare
noun kept is "unsubscribe" itself, because a one-word reply saying exactly that
is the single most common way people opt out and any cleverness there would cost
more than it saves.

### Normalization and the negation guard

Quoted lines (`>` prefixed) are **dropped** before matching. Our own outreach ends
with an opt-out instruction, so without this every reply that quoted us would
look like an opt-out request. When a client does not quote with `>`, the
instruction stays in the haystack and we over-detect — which is the direction
this file is content to fail in.

The negation guard is narrow on purpose. It exists for the one realistic false
positive — *"I don't want to opt out of the conversation, just slow it down"* —
and nothing more. It covers explicit "do not want to / no need to / not asking
to" constructions within 40 characters before the match, and stops there. Every
clause added there is a chance to talk ourselves out of a real opt-out.

Patterns are scanned with `g` so a negated first occurrence does not hide a
genuine second one: *"I don't want to opt out of the project, but please
unsubscribe me"* is still detected.

Subject and body are scanned together, because "unsubscribe" in a subject line
with an empty body is a complete request.

### What happens on detection

```
suppression entry (scope=email, source=inbound_reply, notes carry the matched phrase)
  → stage: UNSUBSCRIBED (for 'unsubscribe') or DO_NOT_CONTACT (otherwise)
  → conversation status: closed
  → activity: UNSUBSCRIBED or DO_NOT_CONTACT
  → NO AI analysis queued
```

## The opt-out line we put in drafts

`buildUnsubscribeInstruction(businessIdentity)`:

> If you would prefer not to hear from us, reply to this email with **STOP** and
> we will not contact you again. You can also write to `<senderEmail>`.
> `<senderName>` reads every reply.

**Reply-with-STOP rather than a hosted unsubscribe link.** The reply lands in the
same mailbox the outreach came from, it is handled by `detectOptOut` on import,
and it works even if every other part of this system is down.

It returns the **empty string** when no sender address is configured, rather than
producing a line that points nowhere. An opt-out route that does not reach anyone
is worse than none, because it looks like one. The empty string is what makes the
US profile's `opt_out_mechanism_present` check fail and hold the lead until
`business.identity` is filled in.

`services/outreach.js` appends the line to any draft that does not already
contain it. The model is never asked to write it.

`messageContainsOptOutInstruction(body)` is deliberately strict: it looks for the
reply-with-STOP *mechanism* (`/\breply\b[^.\n]{0,60}?\bstop\b/`), not merely for
the word "unsubscribe". A draft that mentions unsubscribing without saying how
would pass a looser check while leaving the reader with no route. Strictness
fails toward holding a draft for a person — the cheap direction.

The US profile's `opt_out_mechanism_present` evaluator checks **both** halves:
can a line be produced for this sender, and — when the draft is attached — is it
actually in the text? The second half exists because a draft that lost its
opt-out line during editing looks identical to one that never needed it.

`objection_handling_available` (PH) shares the same mechanism on purpose. An
objection and an unsubscribe arrive through the same reply, are detected by the
same deterministic check, and land in the same suppression registry — two
separate routes would mean two chances to leave one of them unwired.

## Additional safeguards outside this directory

- **`/crawler`** gives any site operator a stated route: block the bot in
  robots.txt, or email `hello@devlabstudios.com` to be added to the do-not-contact
  list, **no reason required**.
- **No tracking pixels.** An email open is not recorded anywhere.
- **No open tracking, no profiling.** A click on a first-party tracked link is the
  only recorded recipient behaviour.
- **Data minimization throughout**: full HTML is never stored, message bodies are
  plain text with quoted history stripped, contact discovery runs only after
  qualification, and role addresses are preferred over named individuals.
- **The engine cannot send.** Every message that reaches a human being was sent by
  a human being, from their own mailbox, after reading it.
