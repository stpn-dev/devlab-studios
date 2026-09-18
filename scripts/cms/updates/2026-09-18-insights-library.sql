-- GENERATED FILE - do not edit by hand.
-- Source: src/data/insights/*.js
-- Regenerate: node scripts/cms/generate-insights-seed.mjs
--
-- Upserts the Insights library. Idempotent, and deletes nothing.

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'ai-automation-small-business-workflows', 'ai-automation-small-business-workflows', 'Where AI automation fits in small business workflows', 'Most small businesses do not need AI everywhere. They need it in the four or five places where the same information gets rewritten by hand. Here is how to find them.',
  'Strategy', 'guide', 'Lightbulb', '["Missed follow-ups","Manual routing","Repeated summaries","Disconnected tools"]',
  '## Start where work is repeated, not where it is interesting

The instinct when adopting AI is to look for the most impressive thing it can do. That is almost always the wrong place to start, because impressive tasks tend to be rare, high-stakes, and hard to verify. The tasks worth automating first are the boring ones that happen every day and cost a few minutes each time.

A useful filter: find every point in the week where a person reads something in one system and types a version of it into another. That copying is pure overhead. It produces no new judgement, it is where transcription errors enter, and it is the first thing to get skipped when the week gets busy.

## Map one workflow end to end before touching a tool

Pick a single process and write it out as a sequence: what starts it, who touches it, what they decide, where the information ends up. Do this on paper before opening any automation platform. Two things usually fall out of the exercise immediately.

The first is that the process has more steps than anyone thought. The second is that at least one step exists only because a previous tool could not do something — a workaround that has outlived its cause.

- What event starts this work?
- What information is needed, and where does it currently live?
- What decision does a person actually make?
- Where does the result have to land for the next person?
- How does anyone know it finished?

That last question is the one most often missing, and it is the one that decides whether the automation is trustworthy later.

## Separate interpretation from decision

This is the distinction that keeps automated systems debuggable. AI is good at interpretation: reading unstructured text and producing a structured answer. It is a poor choice for the decision itself when that decision has rules.

Classifying an inbound message as a billing question is interpretation. Deciding that billing questions go to a specific person, within a specific window, and escalate after it, is a rule. Put the interpretation in the model and the rule in the workflow.

The practical benefit is that when something goes wrong you can tell which half failed. If the routing is wrong, you read a rule. If the classification is wrong, you look at the input and the prompt. When both live inside one prompt, every failure looks the same and none of them are reproducible.

## Good candidates share three traits

Workflows that automate well tend to have a clear trigger, a bounded input, and a destination that can confirm receipt. Lead intake has all three. So does turning a call transcript into notes, routing inbound mail by intent, and keeping a CRM field in step with a form submission.

Workflows that automate badly usually fail one of those. If the trigger is "when someone mentions it", if the input could be anything, or if the destination is a person''s judgement rather than a system, the automation will produce more exceptions than throughput.

## Keep a person in the loop where the cost of being wrong is real

Drafting is a safer pattern than sending. A system that writes a reply and holds it for approval captures most of the time saving while keeping the failure mode visible. Once the approval step has run for a few weeks and the edits have become trivial, you have evidence for removing it — evidence that did not exist on day one.

The reverse order, automating the send and adding review after something goes wrong, means the first failure happens in front of a customer.

## Design the handover before you need it

The measure of a working automation is not that it saves time this month. It is that the next person to own it can understand it without you. That means the trigger, the expected input, the model''s role, the validation, the destination, and the failure behaviour are all written down somewhere that is not a person''s memory.

Automation that only its author understands is not an asset. It is a dependency.

## Cost the workflow before you cost the tool

The question "what will this cost" usually gets answered with a subscription price, which is the smallest part of it. The real figure is the build, plus the ongoing attention, plus what it costs when it is wrong.

A more useful estimate has four lines. What the manual version costs per month in time. What building it costs once. What it will cost to keep working — credential renewals, upstream changes, the occasional investigation. And what a failure costs, multiplied by how often you expect one.

That fourth line is the one that changes decisions. A workflow saving two hours a month that produces a customer-visible error twice a year is not a good trade, however cheap the platform is.

## Start with one workflow and finish it

The most common failure pattern is breadth: five workflows started, none finished, none trusted, all needing maintenance. It happens because starting is satisfying and finishing is not — finishing means error handling, the runbook, the monitoring, and the awkward edge cases.

One workflow taken all the way to the point where someone else could own it is worth more than five that mostly work. It also teaches you what "all the way" costs in your environment, which is the number you need before committing to the next four.

## What good looks like after six months

A useful test, applied later rather than at launch: can someone who did not build it explain what it does, tell whether it ran today, and fix it when it breaks?

If yes, the automation is infrastructure. If no, it is a person''s side project that happens to be load-bearing, and the business is exposed to whether that person is available. The difference is not in the code — it is in the documentation, the observability, and whether anyone else has ever touched it.', '', '["AI Automation","Small Business","Workflow Mapping"]',
  'DevLab Studios', '2026-07-18', 4,
  1, 10, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'lead-intake-automation-checklist', 'lead-intake-automation-checklist', 'A checklist for automating lead intake without losing leads', 'Lead intake is the workflow most often automated first and most often automated badly. A checklist for the parts that decide whether an inquiry survives the trip.',
  'Lead Systems', 'guide', 'ClipboardList', '["Capture","Validate","Persist","Deliver","Confirm"]',
  '## The failure nobody sees

A lead intake system fails silently more often than loudly. The form submits, the visitor sees a success message, and the inquiry never arrives anywhere. Nobody complains, because the person who would complain does not know it happened, and the business only notices as a vague sense that the site is not converting.

Everything below exists to make that failure impossible or at least loud.

## Persist before you deliver

This is the single most important structural decision. Write the submission to your own storage first, synchronously, and decide the visitor''s success message from that write. Only then attempt to deliver it onward — to a CRM, an email, a webhook, whatever.

The reason is that every downstream system will be unavailable at some point. If the visitor''s confirmation depends on the CRM accepting the record, then a CRM outage becomes a lost lead. If it depends only on your own write, a CRM outage becomes a queued delivery you can retry.

- Validate the input
- Write it to storage
- Respond to the visitor
- Attempt delivery in the background
- Record the outcome of every attempt

## Validate on the server, whatever the form does

Client-side validation is a convenience for the visitor. It is not a control. Anything that can be submitted from a browser can be submitted without one, so the same schema has to run on the server, and the server''s answer is the one that counts.

Sharing one schema definition between the form and the endpoint is worth the small amount of setup. It means the rules cannot drift apart, and a field added in one place cannot be silently ignored in the other.

## Record every delivery attempt, not just the last one

A single status column — delivered or failed — throws away the information you need when something is wrong. Keep a row per attempt with the timestamp, the target, the response, and a category for the failure.

The category matters more than it sounds. A transient failure (timeout, rate limit, 5xx) should be retried. A permanent one (malformed payload, rejected address, revoked credential) should not — retrying it just burns attempts and hides the real problem. A configuration failure (missing API key) is a third thing again: it means nothing will ever succeed until a person changes something.

## Make duplicates impossible rather than unlikely

Retries, double-clicks, and browser refreshes all produce the same submission twice. Rather than trying to prevent that at the edges, give each submission a key derived from its own content — the type, the sender, the message, and a coarse time bucket — and make that key unique in storage.

The second submission then collapses into the first by construction. This is much more reliable than debouncing a button.

## Decide what happens to spam before it arrives

Some proportion of submissions will be automated. A challenge widget handles most of it, a rate limit handles bursts, and a length cap on the request body handles the rest. None of these should be able to reject a real inquiry, which means each needs a decision about what happens when the control itself is unavailable.

A rate limiter that fails closed will eventually take your contact form offline during an unrelated outage. One that fails open will briefly stop counting. For an intake form, failing open is usually the right trade — but it should be a decision someone made, not an accident.

## Confirm the path end to end, in production, on purpose

The last item on the checklist is the one most often skipped: submit a real inquiry through the real form on the real site, and follow it all the way to where it is supposed to land. Do this after every change to the pipeline.

An intake system that has never been tested end to end is not a system. It is a hypothesis.

## Decide what the visitor is told, and when

The confirmation message is part of the system''s contract, not a decoration. "Thanks, we''ll be in touch" implies a person will see this. If delivery failed silently and nobody does, the message was a promise the system did not keep.

Say what is true at the moment you say it. If the submission is stored and a person reviews it within a working day, say that. If an automated reply is coming, say so and say roughly when. Vague reassurance is worse than a specific modest claim, because a specific claim can be verified and a vague one quietly erodes trust when it turns out to be untrue.

## Keep the raw submission, not only the parsed one

Normalizing input is necessary — trimming, formatting phone numbers, mapping a free-text field onto a known set. Keep what was actually typed as well.

When something looks wrong three weeks later, the question is almost always "what did they actually send us", and a normalized record cannot answer it. The storage cost is trivial. The alternative is reconstructing intent from a value that has already been through two transformations.

## Instrument the funnel across the seam

Page analytics tell you how many people submitted. Pipeline logs tell you how many records were delivered. Neither answers the question that matters: of the people who tried, how many became something a person acted on?

Carry one identifier from the form through to the delivery record. Without it a drop-off between the two halves is invisible, because each side reports itself as healthy and neither can see the other.

## Review the failures on a schedule, not on complaint

Put a recurring slot in the calendar to look at the failed and pending records. Ten minutes a fortnight is enough.

This is the control that catches everything the other items miss — the failure nobody anticipated, the upstream that started rejecting a field, the gradual rise in one error type. Intake systems do not usually break all at once. They develop a small persistent leak, and the only thing that finds a leak is someone looking.', '', '["Lead Intake","CRM","Automation Design"]',
  'DevLab Studios', '2026-07-11', 4,
  0, 20, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'zapier-make-n8n-comparison', 'zapier-make-n8n-comparison', 'Zapier, Make, and n8n: choosing on constraints, not features', 'All three will connect your tools. The feature lists are not what separates them — cost shape, debuggability, and who can maintain the result are.',
  'Tools', 'guide', 'Boxes', '["Cost shape","Debuggability","Portability","Who maintains it"]',
  '## The feature comparison is a distraction

Any of these platforms can move data between two systems on a trigger. Comparing connector counts is close to meaningless, because the connector you need either exists or you are calling an HTTP endpoint yourself, and every one of them can call an HTTP endpoint.

The decisions that actually matter show up months later: what it costs as volume grows, how quickly you can tell why a run failed, and whether the person who inherits it can work on it.

## Cost scales differently, and the difference compounds

These platforms bill on different units. Some count each step in a workflow, some count each run regardless of steps, some are a flat cost for a server you operate. A workflow with many small steps is cheap under one model and expensive under another, and the ranking flips depending on the shape of your automation rather than its usefulness.

The practical move is to take one real workflow you already run, count its steps and its monthly volume, and price it under each model. This takes twenty minutes and is far more informative than any comparison table, because it uses your shape rather than an average one.

Watch for the cliff: pricing tiers tend to jump rather than glide, so the meaningful question is not what it costs now but what it costs at three times the volume.

## Debuggability is the property you will care about most

Six months in, the question is never "can this platform do X". It is "why did last Tuesday''s run not fire". What you want to know is which step failed, what the input to that step was, what came back, and whether it was retried.

Look specifically for: how long execution history is retained, whether you can see the actual payload at each step, whether you can replay a failed run with the original input, and whether failures notify anyone or simply sit in a log. Retention is the one people are most often surprised by, because it is short on the cheaper tiers and you only discover that while investigating something that happened last week.

## Self-hosting trades a bill for a responsibility

Running your own instance removes per-run pricing and gives you full access to execution data. It also makes you responsible for uptime, upgrades, backups, and the credentials stored inside it.

That trade is worth making when automation volume is high enough that per-run pricing dominates, or when the data passing through genuinely cannot leave your own infrastructure. It is not worth making to save a small subscription, because the operational cost of a server nobody is watching is much higher than the invoice.

- High volume, predictable shape: self-hosting usually wins
- Sensitive data with residency requirements: self-hosting is often the only option
- A handful of workflows, low volume: hosted is almost always cheaper in total
- Nobody on hand to own a server: hosted, without hesitation

## Ask who maintains it, and design for that answer

If the answer is a non-technical operations person, a visual builder with a constrained node set is a feature, not a limitation — the constraint is what keeps the workflow readable. If the answer is a developer, the ability to drop into code inside a step will save a great deal of contorted node-wiring.

Choosing a tool that assumes the wrong maintainer produces the same outcome either way: the workflow stops being edited, then stops being trusted, then gets replaced by a person doing it manually again.

## Assume you will move at least once

Treat the platform as replaceable. Keep the business rules written down outside it, keep credentials in one place you control, and prefer plain HTTP calls to proprietary steps where the difference is small.

None of that is free, but it is much cheaper than discovering that a year of process knowledge exists only as boxes and arrows inside a product you have outgrown.

## Test the integration you are actually worried about

Every platform''s connector list includes the tool you need. What the list does not tell you is whether that connector supports the specific operation you depend on, at the volume you need, with the fields you care about.

Before committing, build the single riskiest step — the unusual API, the high-volume sync, the one with awkward pagination — on a trial account. An afternoon spent here answers a question no comparison article can, because the answer depends on your endpoint rather than on the platform in general.

## Credentials and access are a security decision

These platforms hold long-lived credentials to your business systems. That makes the platform part of your security surface, and worth the same questions you would ask of any vendor with that access.

Who on your team can see or export stored credentials. Whether connections are made under a service account or a person''s login — the latter breaks when they leave, and takes the workflow with it. Whether audit history shows who changed a workflow and when. Whether data passing through is retained, and for how long.

- Connect under service accounts, never a personal login
- Keep an inventory of which workflows hold which credentials
- Know the retention period for execution data containing customer information
- Confirm you can revoke access quickly if you need to

## Plan the exit before you need it

Treat the platform as replaceable, because eventually it will be. Keep the business rules written down outside it, keep credentials in one place you control, and prefer plain HTTP calls to proprietary steps where the difference is small.

Exports help less than people expect: most platforms export a workflow in their own format, which is useful for backup and useless for migration. The portable artifact is the written description of what the process does and why.

## The honest summary

For a handful of straightforward workflows maintained by a non-technical team, the hosted options are almost always right and the choice between them is close to arbitrary. For high volume, unusual integrations, or data that cannot leave your infrastructure, self-hosting starts to pay — provided somebody owns the server.

The wrong answer is choosing on a feature matrix and discovering the real constraints six months later.', '', '["Zapier","Make","n8n","Tooling"]',
  'DevLab Studios', '2026-07-04', 5,
  0, 30, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'preparing-business-data-for-automation', 'preparing-business-data-for-automation', 'Preparing business data before you automate anything', 'Automation does not fix messy data. It industrialises it. What to settle about your records before workflows start reading and writing them.',
  'Data Readiness', 'guide', 'Database', '["One source of truth","Stable identifiers","Explicit states","Known gaps"]',
  '## Automation amplifies whatever is already there

A manual process tolerates inconsistent data because a person silently corrects it. They see two spellings of a company name and know it is one company. They see a blank field and ask. An automated process does none of that — it applies the same rule to both spellings and treats the blank as a value.

So the question before automating is not "is our data good enough". It is "what is my process currently doing by hand that the automation will not do".

## Decide which system is authoritative for each field

Most businesses end up with the same customer represented in several places: a CRM, a spreadsheet, an invoicing tool, an inbox. That is fine, as long as each field has exactly one system that owns it.

Without that decision, two automations will eventually write conflicting values and the last one to run wins. That failure is particularly unpleasant because it is intermittent and depends on timing, so it looks random.

Write it down as a table: field, owning system, everything else reads it. It takes an afternoon and prevents a category of bug that is very hard to diagnose later.

## Give every record a stable identifier

Matching records on a name or an email address works right up until someone changes their name or address, and then it silently creates a duplicate. Every entity that automation touches needs an identifier that never changes and is not derived from anything a person can edit.

If a system does not expose one, generate one and store it on both sides. The cost of adding this early is small. The cost of adding it after two years of records is a data migration.

## Make status explicit rather than inferred

A great deal of operational knowledge lives as inference: this row is "active" because the last column has a date in it, or a deal is "closed" because someone moved it to a particular tab. That works when a person reads it and fails when a rule does.

Replace inferred states with an explicit field holding a value from a known set. Then enumerate every value the set contains, including the awkward ones — "on hold", "cancelled by us", "duplicate". Automations will encounter all of them, and the ones you did not enumerate are the ones that will produce the strange behaviour.

- Every state a record can be in, named
- Which transitions are legal, and which are not
- What should happen to work already in flight when a record changes state

## Know where the gaps are before the workflow finds them

Run a count of empty values in every field the automation will read. Not a sample — a count. The number is usually higher than anyone expects, and it tells you whether a field can be treated as required or needs a fallback.

The same goes for format: how many phone numbers are in a form your SMS provider will accept, how many dates are strings rather than dates, how many email addresses have trailing spaces. These are all trivial to fix in bulk beforehand and genuinely annoying to handle one-at-a-time inside a workflow.

## Fix the intake, not just the backlog

Cleaning existing records is worth doing once. It is worth very little if the thing producing those records keeps producing them in the same shape.

Most data quality problems are validation problems that happened earlier — a free-text field where a list belonged, an optional field that should have been required, a form that accepted anything because rejecting input felt unfriendly. Tighten the intake first, then clean up behind it. Otherwise you will be cleaning the same fields again next quarter.

## Agree what a duplicate is before you deduplicate

"Remove duplicates" sounds like a settled instruction and almost never is. Two records with the same email and different names might be one person who changed theirs, or two people sharing an inbox. Two companies with the same name at different addresses might be branches, or might be unrelated.

Write the rule down as a decision someone made: these fields matching means the same entity, these fields matching means a probable match to review, everything else is distinct. Then automate against the rule rather than against an intuition, and keep probable matches in a queue rather than merging them silently.

A wrong merge is much harder to undo than a missed one.

## Decide what happens to history

When a record changes, does the old value matter? For a status field the answer is usually yes — knowing something was proposed before it was approved is often the entire question. For a corrected typo, no.

This decision determines whether you need an event log alongside the current state. Retrofitting one is expensive, because the history you wanted is exactly the history you did not keep. Deciding early costs almost nothing.

## Test the migration on a copy, with the real data

Cleaning scripts behave differently on real data than on samples, because real data contains the cases nobody thought of: the empty string that is not null, the date in a different century, the name with an unexpected character.

Run the cleanup against a full copy first and count what changed. If the count is much larger or much smaller than expected, the rule is wrong — and finding that out on a copy is free.

## Assign an owner per system, not per project

Data quality is not a project that finishes. Fields drift, new integrations write new values, and somebody eventually needs a decision about whether a new status is legitimate.

Name a person per system who owns those decisions. Without one, each integration makes its own choice and the definitions diverge again, usually within a year and usually invisibly until two reports disagree.', '', '["Data Quality","CRM","Operations"]',
  'DevLab Studios', '2026-06-27', 4,
  0, 40, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'ai-agents-vs-workflow-automations', 'ai-agents-vs-workflow-automations', 'AI agents versus workflow automation: which problem are you solving?', 'An agent decides what to do next. A workflow already knows. That single difference determines cost, reliability, and how you debug it at 2am.',
  'AI Agents', 'guide', 'Zap', '["Fixed path","Chosen path","Verifiable output","Bounded blast radius"]',
  '## The distinction is who chooses the next step

A workflow automation has its path decided in advance. When this happens, do that, then that. The model, if one is involved at all, fills in a value somewhere along a route that was fixed before the run started.

An agent is given a goal and chooses its own steps, including which tools to call and in what order. The path is decided during the run, and it can differ every time.

Everything else — cost, latency, reliability, how you test it — follows from that one difference.

## Fixed paths are cheap and boring, which is the point

A workflow costs what its steps cost. It takes as long as its slowest step. It fails in a small number of ways you can enumerate, and when it fails you can point at the step. You can write a test that asserts the whole thing end to end, because the path is knowable.

For the overwhelming majority of business processes this is exactly what you want. Lead routing, data sync, notification, report generation, document handling — none of these need anything chosen at runtime. They need to be right every time.

## Agents earn their cost when the path genuinely cannot be known

There are real problems where enumerating the branches is impractical. Investigating an open-ended question across several systems. Handling a request that could be any of forty things. Working through a task where step three depends on what step two turned up.

For these, an agent is not overengineering — a workflow covering the same ground would be an unmaintainable tree of conditionals. But be honest about which problem you have, because the agent shape costs more on every axis.

- Cost: several model calls per run rather than zero or one, and the count varies
- Latency: seconds to minutes rather than milliseconds
- Testing: the same input can produce different paths, so assertions have to be about outcomes, not sequences
- Debugging: you are reconstructing a decision, not reading a route

## Bound what an agent can reach

The blast radius of a workflow is whatever its steps touch, and you can read them. The blast radius of an agent is every tool you gave it, in any order, any number of times.

That means the tool list is the real security boundary. Give it the narrowest possible set. Prefer tools that read over tools that write. For anything destructive or externally visible — sending mail, issuing refunds, deleting records — require a human approval step rather than trusting the model to have judged correctly.

A useful test: if the agent did the most damaging combination of its available actions, what would that cost? If the answer is unacceptable, the tool list is wrong, not the prompt.

## Most useful systems are mostly workflow

In practice the strongest designs are a fixed pipeline with a model at one or two specific points. Classify this. Extract these fields. Draft this reply. The surrounding structure — validation, routing, storage, retries, notification — stays deterministic.

This gets most of the benefit of using a model while keeping the properties that make a system operable. When something breaks you are usually looking at one step with a known input and a known expected output, which is a debuggable situation.

## Decide by the failure you can live with

Ask what happens when it gets it wrong, because it will. If the answer is "a person notices and fixes it in a minute", either shape is fine. If the answer is "a customer receives something incorrect" or "a record is changed and nobody knows", you want the fixed path, and you want a person in front of the irreversible step.

Start with the workflow. Add the agent when you have a concrete case where enumerating the branches has actually become the problem.

## Cost is variable in a way a workflow''s is not

A workflow''s cost is a known number per run. An agent''s is not: it depends on how many steps it chose to take, and that varies with the input. The same task can cost twice as much on a Tuesday because the phrasing was ambiguous.

That matters for budgeting, and it matters more for the failure mode. An agent stuck in a loop — calling a tool, getting an unhelpful result, trying again — can spend a great deal before anything notices. A hard cap on steps and on total spend per run is not an optimisation; it is the thing standing between a bad input and a large bill.

- Cap the number of steps per run, and log when the cap is hit
- Cap total spend per run, and per day
- Alert on runs that hit either cap, since that is where the pathologies live

## Testing an agent is a different discipline

A workflow is tested by asserting that a given input produces a given output. That works because the path is fixed.

An agent''s path varies, so the same assertion style produces flaky tests that fail for reasons unrelated to correctness. What you can assert is the outcome: the record ended up in the right state, the answer contains the right facts, no forbidden tool was called. Build a set of real inputs with known-good outcomes and measure the pass rate rather than expecting determinism.

A pass rate also gives you something a binary test cannot — the ability to tell whether a prompt change helped, which is otherwise guesswork.

## The hybrid shape in practice

Most useful systems are a fixed pipeline with a model at one or two specific points, and the interesting design work is deciding where those points are.

A good rule: the model handles the step where the input is unstructured and the output is small and checkable. Everything around it — deciding what to do with that output, where it goes, what happens on failure — stays deterministic code you can read.

That shape keeps the debuggable properties of a workflow while getting the part of the model that is genuinely hard to replace.', '', '["AI Agents","Automation Design","Operations"]',
  'DevLab Studios', '2026-06-20', 4,
  0, 50, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'writing-automation-runbooks', 'writing-automation-runbooks', 'Writing a runbook an automation can actually be handed over with', 'An automation only one person understands is a dependency, not an asset. What a runbook needs to contain for someone else to own it.',
  'Handover', 'guide', 'FileText', '["Trigger","Contract","Failure modes","Recovery","Owner"]',
  '## The test a runbook has to pass

Hand it to someone competent who has never seen the system, take away their ability to ask you anything, and give them a failure. If they can work out what broke and what to do about it, the runbook works. If they cannot, it is a description rather than a runbook.

Most automation documentation fails this test because it explains what the system does rather than what to do when it does not.

## Start with the contract, not the diagram

Diagrams age badly and tend to describe an implementation that has since changed. What stays stable is the contract: what goes in, what comes out, and what is guaranteed.

State it plainly. This workflow accepts a submission with these fields. It guarantees the record is stored before the visitor sees a confirmation. It attempts delivery to these targets. It does not guarantee delivery on the first attempt. It retries transient failures up to this many times.

Someone reading that knows immediately whether a missing record and a missing email are the same problem. They are not, and that distinction is the whole of the debugging.

## Name the trigger precisely

"Runs when a form is submitted" is not precise enough. Which form, on which page, posting to which endpoint, and is there a schedule as well? If there is a cron, state the expression and the timezone it is interpreted in — a cron written in UTC and read by someone in another timezone is a recurring source of "it did not run" reports when it ran exactly as configured.

## Enumerate the failure modes you already know about

This is the section that earns the document. For each one: what it looks like from the outside, how to confirm it, and what to do.

- The upstream service is down — symptom, how to check, what to do, and whether it self-recovers
- A credential has expired — how it presents, where to renew, what to replay afterwards
- The input arrived in an unexpected shape — where the rejected payload is kept, how to reprocess
- The run did not fire at all — how to distinguish "did not fire" from "fired and did nothing"

That last one matters more than it looks. A run that fired and found nothing to do, and a run that never fired, are completely different problems with the same visible signature: nothing happened.

## Say how to observe it

Where do the logs go, how long are they kept, and what is the one query that answers "did this run today". If observability is an execution history inside a hosted platform, say how long that history is retained, because that number decides whether investigating last week''s incident is even possible.

If nothing notifies anyone on failure, write that down explicitly. A known gap is manageable. An assumed alert that does not exist is how failures go unnoticed for weeks.

## Write down the recovery, including the manual one

Every automation should have a documented way to do the same work by hand. Not because you expect to, but because the day the platform is down is not the day to be reverse-engineering what the workflow was supposed to produce.

Include whether reprocessing is safe. If the workflow is idempotent, say so and say why — usually because of a key that makes a duplicate collapse into the original. If it is not idempotent, say what running it twice would do, because someone will eventually be deciding whether to press the button under time pressure.

## Name an owner and a review date

An unowned automation degrades quietly. APIs change, credentials expire, volumes grow past a tier. Put a name against it and a date to look at it again, and keep the runbook next to the code rather than in a document nobody opens.

The runbook is not overhead on the build. It is the part that makes the build survivable.

## Write it while building, not afterwards

A runbook written after the fact documents what you remember, which is the happy path. The awkward details — why that retry is three and not five, why that field is nullable, which upstream returns a 200 with an error body — are exactly the things that fade first and matter most.

Keeping a running note while building costs almost nothing and captures decisions at the moment there is a reason for them. Tidy it at the end.

## Record what you decided not to do

A runbook that only describes the built thing invites the next person to "improve" it back into a problem you already solved.

If you deliberately did not retry a class of failure, say so and say why. If a step is manual on purpose because the cost of being wrong is high, write that down. These notes prevent a specific and frustrating kind of regression: someone removing a safeguard because its reason was never recorded.

## Include the queries, not just the advice

"Check whether the sync ran" is advice. The exact query, with the table and the field, is a runbook.

Paste the commands. The log filter that shows this workflow''s runs. The query that returns the last successful run. The call that re-triggers it. Someone debugging at an inconvenient hour should be copying and pasting, not reconstructing your reasoning.

## Test the handover for real

The only reliable check is to have someone else use it. Pick a colleague, give them a deliberately broken staging environment and the runbook, and stay out of the conversation.

Everything they have to ask you is a gap. Write down the answer and the document improves permanently. Skip this and you have a document that is complete to its author, which is the only reader who did not need it.', '', '["Documentation","Handover","Operations"]',
  'DevLab Studios', '2026-09-05', 4,
  0, 60, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'what-better-ai-models-change-for-ops', 'what-better-ai-models-change-for-ops', 'What better AI models actually change for operations teams', 'Each model generation gets framed as a leap. From an operations seat, the gains that matter are narrower and more specific than the announcements suggest.',
  'AI Updates', 'ai-update', 'TrendingUp', '["Cleaner extraction","Fewer rewrites","Better refusals","Longer inputs"]',
  '## The announcements and the working gains are different things

Model releases are announced in terms of benchmarks and capability demonstrations. Neither maps cleanly onto whether a workflow that classifies inbound mail got better this month.

The gains that matter operationally are duller: the output comes back in the requested shape more often, extraction is right on messy inputs more often, and the model says it does not know instead of inventing something. Those are not headline features, but they decide how much human correction a pipeline needs.

## Format reliability is worth more than raw capability

For anything feeding a downstream system, the most valuable property is that the output parses. A model that is slightly less capable but returns valid structured output every time is more useful in a pipeline than a stronger one that occasionally wraps its answer in prose.

Every malformed response is either a retry, a fallback, or a manual fix. Reducing their frequency shows up as real recovered time even when benchmark movement is modest.

## Longer context changes architecture, not just capacity

Larger context windows get reported as a capacity number. The operational effect is that a class of workaround disappears: chunking a document, summarizing the chunks, then summarizing the summaries.

That pattern loses information at every hop and is hard to debug, because a wrong final answer could have originated at any stage. Passing the whole document removes the hops. It is worth re-examining pipelines built around the old constraint, because some of their complexity now exists for no reason.

Longer context is not free. Cost scales with tokens, and a prompt that now carries an entire document carries it on every run.

## Better refusals reduce a specific, expensive failure

A model that confidently produces a plausible wrong answer is worse operationally than one that declines. The confident wrong answer propagates into a record, a reply, or a decision, and is discovered later by someone who has to work out where it came from.

Improvements in calibration mean more cases land in a review queue and fewer land in the database. That is a good trade even though the queue looks like more work.

## Smaller models improving matters more than the flagship improving

Most production automation does not need frontier capability. It needs classification, extraction, and short-form drafting. Each generation pushes more of that work into the range where a cheap, fast model is sufficient.

This has the larger practical effect on cost, because it applies to the high-volume work. The flagship improving affects the rare hard call; the small model improving affects every run.

## How to tell whether an upgrade helped you

Do not take the benchmark''s word for it. Keep a fixed set of twenty or thirty real inputs from your own workflow, with the answers you actually want. Run them against the current model and the candidate, and compare.

This takes an hour to set up and turns model selection from a reading exercise into a measurement. It also catches the case nobody expects: an upgrade that improves general capability while regressing on the narrow thing your pipeline depends on.

## Cheaper is a capability change too

Price drops get reported as a commercial story, but for operations they are a
capability story. Work that was uneconomic at one price becomes routine at a
tenth of it.

Summarizing every inbound message rather than the flagged ones. Classifying an
entire backlog rather than sampling it. Running a second model over the first
one''s output as a check. None of these need any new capability — they were
simply not worth the cost, and at some point they are.

Worth revisiting periodically: the list of things you decided against on cost
grounds. Some of them have quietly become sensible.

## Deprecation is the risk nobody budgets for

Models are retired. A pipeline pinned to a specific version will eventually get
a notice with a date on it, and the replacement will behave slightly differently
on your inputs even when it is better in general.

The defence is the same evaluation set as above, plus keeping the model
identifier in configuration rather than scattered through the code. With both,
a deprecation is an afternoon. Without them, it is an unplanned project with an
externally imposed deadline.

## What to actually do when a new model ships

Not much, immediately. Read what changed, and check the two things that affect
you: whether your current model is now deprecated, and whether the price of the
tier you use moved.

Then, when there is a quiet hour, run your evaluation set against the new model
and compare. Most of the time the answer is that nothing meaningful changed for
your workload, and knowing that with evidence is worth more than the upgrade
would have been.', '', '["AI News","Operations","Practical Use"]',
  'DevLab Studios', '2026-07-05', 4,
  0, 70, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'small-models-are-often-the-right-call', 'small-models-are-often-the-right-call', 'When a small model is the right call', 'Reaching for the largest available model is usually wrong for production workloads. What small models handle well, and how to tell whether your task is one of them.',
  'AI Updates', 'ai-update', 'Cpu', '["Classification","Extraction","Short drafting","High volume"]',
  '## The default is expensive and often unnecessary

When a workflow needs a model, the path of least resistance is the strongest one available. It works, so nothing forces a re-examination. Meanwhile the cost per run is several times what the task requires, and the latency is several times what the experience allows.

The question worth asking on every model call is not which model is best. It is what is the smallest model that is reliably correct here.

## Three task shapes where small models hold up

Classification with a known set of labels. Routing an inbound message to one of eight categories needs reading comprehension and instruction-following, not deep reasoning. The fixed label set also makes correctness measurable.

Extraction from semi-structured text. Pulling a date, an amount, and a reference out of a message is pattern recognition with tolerance for mess. The failure mode is usually a missing field rather than an invented one, which is the safer direction.

Short-form drafting where a person reviews the output. One or two sentences from supplied material, in the tone requested. The review step absorbs the quality gap.

## Where they do not hold up

Multi-step reasoning where an early error compounds. Tasks needing broad world knowledge rather than reading the supplied text. Anything acted on without review where being subtly wrong is costly. Long inputs where the relevant detail is buried and easily missed.

The boundary is fuzzy and moves with each generation, which is exactly why it should be measured rather than assumed.

## Measure it on your own inputs

Take thirty real examples and write down the correct output for each. Run them through a small model and a large one. Count the differences and read them.

Two outcomes are common. Either the small model is indistinguishable, and the choice is obvious. Or it fails on a recognisable subset — the longest inputs, the ambiguous ones — in which case route on that property rather than upgrading everything.

- Same accuracy: use the small model
- Fails on an identifiable subset: route, do not upgrade wholesale
- Fails unpredictably: use the larger model, and keep the test set for next time

## Cost is not the only reason

Latency compounds in a pipeline. Three model calls at two seconds each is a six-second wait, which is the difference between a response feeling immediate and feeling broken.

Small models also make retries affordable. If a call is cheap and fast, you can run it twice and compare, or validate the output and re-ask when it fails a check. Those patterns buy back much of the reliability gap, and they are impractical when each call is expensive.

## Keep the choice reversible

Whatever you pick, keep the model identifier in configuration rather than scattered through code, and keep the evaluation set. Models get deprecated, renamed, and repriced on someone else''s schedule.

A pipeline that can swap models by changing one value, and prove the swap was safe by re-running thirty examples, treats that as routine maintenance. One that cannot treats it as a project.

## Routing beats upgrading

When a small model fails on part of your workload, the reflex is to move
everything to a larger one. That pays the larger price on the majority of cases
that were already fine.

Routing is usually better: send the easy cases to the small model and the hard
ones to the large one, on whatever property distinguishes them. Input length is
often enough. So is a confidence signal, or a validation step that re-asks a
stronger model when the first answer fails a check.

The result costs close to the small model''s price with close to the large one''s
accuracy, and it degrades sensibly — if the router is wrong, you have paid too
much rather than got it wrong.

## Prompt quality closes more of the gap than model size

A small model with a clear, specific prompt and two examples routinely beats a
larger one with a vague instruction. Examples matter disproportionately: they
communicate format and edge-case handling more reliably than any description of
them.

This is worth trying before concluding a small model cannot do the job. The
cheapest experiment in this whole area is rewriting the prompt and re-running
the same thirty inputs.

## Latency is a product decision, not just a number

Where a person is waiting, model choice becomes a user experience decision
rather than an infrastructure one. A form that takes four seconds to validate
feels broken regardless of how good the validation is.

Small models make interactive use realistic. They also make it feasible to run
the call on every keystroke-pause rather than on submit, which changes what the
feature can be — a different thing from doing the same feature more cheaply.

## What to keep after choosing

Whatever you land on, keep three artifacts: the evaluation set, the measured
result per model, and the date. Together they are the answer to "why are we on
this model", which someone will ask, and the starting point for re-checking when
the next generation lands.', '', '["AI News","Cost","Model Selection"]',
  'DevLab Studios', '2026-08-14', 4,
  0, 80, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'structured-output-changed-integration-work', 'structured-output-changed-integration-work', 'Structured output changed what integration work looks like', 'Getting a model to reliably return parseable data used to be most of the work in an AI integration. That changed — and it moved the hard part somewhere less obvious.',
  'AI Updates', 'ai-update', 'Code2', '["Schema enforcement","Fewer retries","Validation still required","New failure shape"]',
  '## What the old work looked like

Connecting a model to a system meant coaxing text into a shape a program could read. Prompts carried elaborate formatting instructions. Parsers stripped code fences, handled trailing commas, and coped with the model explaining its answer before giving it. A retry loop caught what the parser could not.

A meaningful share of the code in an early AI integration was not about the task at all. It was about the transport.

## Schema-constrained output removed most of that

Supplying a schema and having the response conform to it structurally removes an entire category of defect. No fences to strip, no preamble to discard, no retry because the model decided to be conversational.

The integration code gets much smaller and much less interesting, which is the correct direction for integration code.

## Structurally valid is not the same as correct

This is the part that catches people out. A schema guarantees the shape: that the amount field is a number and the date field is a string. It guarantees nothing about whether the amount is the right amount.

A model that cannot find a value in the source will still produce one, because the schema requires a value. The failure has moved from unparseable to parseable and wrong, which is harder to notice and considerably more dangerous downstream.

- Make fields nullable when "not present" is a real answer, and check for null
- Validate ranges and formats yourself; the schema only checks types
- Cross-check derived values against their inputs where you can
- Keep a found flag per field when the source may legitimately lack it

## Design the schema to permit uncertainty

The most common mistake is a schema where every field is required. It reads as rigour and produces fabrication, because it forecloses the model''s ability to say the information was not there.

Allowing null, or including an explicit found flag, lets uncertainty surface where it can be handled. Whether that routes to a person or to a fallback is then a decision you get to make. Without it, you never get to make it.

## The hard part is now schema design

Deciding what the fields are, which are optional, what the enumerations contain, and what to do when the source disagrees with itself — that is where the difficulty went. It is a better place for it, because those are domain questions with real answers rather than a fight with a text format.

It also means the schema is worth reviewing with whoever owns the process, not only with whoever writes the code. They are the one who knows a record can legitimately have no reference number.

## What to carry forward

Structured output is a transport improvement, and a large one. It is not a correctness guarantee, and treating it as one replaces a loud failure with a quiet one.

Keep the validation layer you wrote for the old world. It is doing a different job now — checking meaning rather than shape — and that job never went away.

## Null is a real answer and should be allowed to be one

The single most useful schema habit is making a field nullable whenever "not
present in the source" is a legitimate outcome, and then handling the null.

It sounds obvious and is routinely skipped, because a required field feels more
rigorous. It is not: it removes the model''s only honest option and forces a
guess. A nullable field with an explicit downstream branch turns a silent
fabrication into a visible decision.

## Enumerations need an escape hatch

A closed set of values is good schema design right up to the input that belongs
to none of them. Without an escape, the model picks the nearest wrong option and
the record looks fine.

Include an "other" or "unknown" member, and route it somewhere a person sees.
The count of items landing there is also a useful signal in itself: a rising
number usually means the real world has developed a category your schema does
not have yet.

## Validate the meaning, not just the shape

The schema checks types. Everything about whether the values make sense is still
yours to check: dates within a plausible range, amounts matching their currency,
identifiers matching a known format, totals equal to the sum of their parts.

These checks are cheap and catch exactly the failures a schema cannot. They are
also the natural place to decide what happens next — reject, queue for review,
or accept with a flag — which is a business decision rather than a parsing one.

## Keep the raw response

Store what the model returned alongside the parsed record, at least for a while.

When a value looks wrong later, the question is whether the model produced it or
something downstream transformed it, and only the raw response answers that.
It is also what you need to build an evaluation set from real traffic, which is
much better than one assembled from imagination.', '', '["AI News","Integration","Data"]',
  'DevLab Studios', '2026-08-28', 4,
  0, 90, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'inference-at-the-edge-what-it-changes', 'inference-at-the-edge-what-it-changes', 'Running inference at the edge: what it changes and what it does not', 'Models running next to the request remove a round trip and a vendor relationship. They also bring constraints worth understanding before you build on them.',
  'AI Updates', 'ai-update', 'Globe', '["Lower latency","Fewer dependencies","Smaller catalogue","Different limits"]',
  '## The shape of the change

Running a model on the same platform that serves the request removes a hop to a third-party API. No outbound call, no separate key to manage, no second vendor''s status page to check during an incident.

For workloads already running at the edge this is a genuine simplification. Fewer moving parts in the request path means fewer things that can be unavailable independently.

## Latency improves for a specific reason

The gain is not that the model runs faster. It is that the network round trip disappears. For a small model doing a short task, that round trip can be a large fraction of total time.

This matters most for work in the request path, where someone is waiting. For background work it barely matters — a scheduled job does not care about two hundred milliseconds. Be clear about which you have before treating latency as the reason.

## The model catalogue is the real constraint

Platforms offering edge inference expose a curated set of models, not the whole field. That set skews small and open-weight, which suits classification, extraction, and short drafting, and does not suit tasks needing frontier capability.

It also moves on the platform''s schedule. Models get added, deprecated, and renamed without reference to your roadmap, so the identifier belongs in configuration and the evaluation set belongs in version control.

- Check the model you want is actually in the catalogue before designing around it
- Expect the catalogue to change; keep the model id configurable
- Verify the response shape, which differs between models on the same platform
- Confirm behaviour in local development, which often differs from deployed

That last point deserves emphasis. Local development environments frequently cannot reach these bindings at all, so a pipeline that appears to work locally may be silently skipping the model. Whatever the degraded path is, it should be visible rather than inferred.

## Pricing is usage-shaped and needs measuring

Edge inference tends to be billed in a platform-specific unit tied to compute rather than tokens, often with a daily included allowance. That shape is generous for low-volume work and can move quickly at scale.

The right response is to measure rather than estimate. Log the reported usage per run. Then "are we near the limit" has an answer in a dashboard instead of an argument.

## What it does not change

It does not change that the model can be wrong, that outputs need validating, or that a schema does not guarantee correctness. It does not remove the need for a fallback when inference is unavailable.

The failure mode is worth designing deliberately. If the allowance is exhausted, does the feature degrade or break? A summary that publishes without its summary line is degraded. A page that fails to render is an outage. Which one you get is a decision made at build time.

## A reasonable rule

Use edge inference for high-volume, latency-sensitive, small-model work in the request path. Keep an external provider for the harder calls. Keep both behind one interface so the choice per task stays a configuration decision rather than a rewrite.

## Design the degraded path first

The most important decision is what happens when inference is unavailable, and
it is best made before anything is built.

There are only really three answers: fail the request, serve a fallback, or
serve the result without the model''s contribution. Which is right depends on
whether the model output is the feature or an enhancement to it. A translation
feature without the model is broken. A summary line above a list of links is an
enhancement, and the list is still worth serving.

Whichever you choose, make it observable. A degraded path nobody can see becomes
the permanent state, and nobody finds out until somebody asks why the summaries
stopped appearing weeks ago.

## Verify the response shape per model, not per platform

Models on the same platform do not agree on their response format. Some return a
simple text field, some return an OpenAI-style structure with the text nested
several levels down.

Reading only the shape you first encountered produces a failure that is
genuinely hard to spot: the call succeeds, the usage is billed, and the result is
discarded. The code looks correct and the logs say the model was unavailable.
Handle the shapes you might receive, and log which one arrived.

## Local development is not a rehearsal

It is common for these bindings to be unavailable or to behave differently
outside the deployed environment. That means local testing exercises the
degraded path rather than the real one, and can give a false impression in either
direction.

Know which of the two you are looking at. If the local environment cannot reach
the model at all, a green local run tells you the fallback works and nothing
about the model call.

## Measure usage from the first day

Log whatever usage figure the platform reports, per run, from the beginning.

It costs one field and converts every future capacity conversation from an
argument into a query. It also makes the day you approach a limit a thing you
notice in advance rather than a thing you discover from a failure.', '', '["AI News","Edge","Architecture"]',
  'DevLab Studios', '2026-09-10', 4,
  0, 100, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'retrieval-is-plumbing-not-a-feature', 'retrieval-is-plumbing-not-a-feature', 'Retrieval is plumbing, not a feature', 'Most disappointing answers from a document assistant are retrieval failures, not model failures. The model never saw the right passage.',
  'AI Updates', 'ai-update', 'Search', '["Retrieval first","Chunking matters","Cite the source","Measure the fetch"]',
  '## The usual diagnosis is wrong

When an assistant over a document set answers badly, the instinct is to blame the model and reach for a better one. Usually the model performed correctly on what it was given. It was given the wrong passages.

Retrieval is a search problem sitting in front of a language problem, and it fails on its own terms. Debugging the model first means debugging the wrong component.

## Look at what was retrieved before anything else

The first diagnostic is not the answer. It is the list of passages fetched for the question. Print them and read them.

Two patterns account for most failures. Either the relevant passage is simply absent, or it is present but surrounded by enough near-miss material that the salient line is buried. These have different fixes, and neither is a better model.

## Chunking decides what can be found

Documents get split before indexing, and where the splits land determines what is findable. Split too small and a passage loses the context that made it meaningful. Split too large and a chunk covers several topics, so its embedding represents an average of them and matches nothing precisely.

Splitting on structure — headings, sections, natural boundaries — tends to work better than splitting on a fixed character count, because it preserves the unit the author intended. Carrying a little surrounding context into each chunk helps a passage stand on its own.

- Split on document structure, not arbitrary length
- Keep enough surrounding context that a chunk stands alone
- Store the source and location with every chunk
- Re-index when the source changes, and know how you would tell

## Semantic search alone misses exact terms

Embedding similarity is good at meaning and unreliable at precision. A query containing a specific product code, error number, or proper noun can fail to retrieve the document containing that exact string, because the embedding captures general sense rather than the token.

Combining keyword matching with semantic search covers both. It is more machinery, and it removes an entire class of "why can it not find the thing I literally named".

## Make the answer cite its source

Requiring each claim to point at the passage it came from does two things. It gives the reader a way to verify, and it gives you a way to debug: a wrong answer with a citation tells you immediately whether retrieval or interpretation failed.

It also constrains fabrication. A model asked to answer only from supplied passages, and to say when they do not contain the answer, produces "not found" far more often than one asked to be helpful.

## Measure retrieval separately

Keep a set of real questions with the passages that should be retrieved for each. Then you can measure whether the right material was fetched, independently of what was written afterwards.

Without that separation, every change is judged on the final answer, and you cannot tell whether a prompt tweak helped or an unrelated indexing change did. Retrieval quality is measurable on its own, and measuring it is what stops the whole system being tuned by feel.

## Metadata filtering removes more noise than better ranking

A large share of "the answer was wrong" turns out to be the right answer from
the wrong document — a superseded version, another customer''s, a different
region''s.

Storing structured metadata alongside each chunk and filtering before ranking
removes that class entirely. Date, source, version, owner, visibility. It is
less interesting than tuning similarity and it fixes more real failures,
because it eliminates candidates rather than reordering them.

## Decide what happens to stale content

An index is a copy, and copies go out of date. The failure is quiet: confident
answers from a document that was replaced last quarter.

Decide up front how the index learns about changes, how quickly, and what
happens to deleted sources. Then carry the source''s date into the answer, so a
reader can see they are being told something from two years ago even when the
retrieval did exactly what it was asked.

## Test with the questions people actually ask

Evaluation sets tend to be written by the person who built the system, which
means they are phrased the way the system expects. Real questions are shorter,
vaguer, full of internal shorthand, and often not questions at all.

Collect real ones as soon as there are any, and evaluate against those. The
first batch is usually humbling and always more useful than the imagined set.

## Know when retrieval is the wrong tool

Some questions cannot be answered by finding a passage: anything requiring a
count, an aggregate, a comparison across many records, or a calculation. No
amount of retrieval quality fixes "how many open tickets does this customer
have", because the answer is not written down anywhere to retrieve.

Those belong to a query against structured data. Recognising which kind of
question you are handling — and routing accordingly — matters more than any
tuning inside the retrieval path.', '', '["AI News","Retrieval","Knowledge"]',
  'DevLab Studios', '2026-09-12', 4,
  0, 110, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'why-website-speed-and-automation-now-overlap', 'why-website-speed-and-automation-now-overlap', 'Why website speed and automation now overlap', 'A slow page and a broken workflow used to be separate problems owned by separate people. They are the same pipeline now, and they fail into each other.',
  'Web Systems', 'ops-note', 'Zap', '["Shared pipeline","Cleaner input","Fewer retries","One owner"]',
  '## The handoff used to be a wall

For a long time the website and the operational systems behind it were separate concerns. Marketing owned the page, operations owned what happened after the form submitted, and the boundary was the submit button.

That boundary has largely dissolved. The form posts to an endpoint that validates, stores, enriches, routes, and notifies, and the visitor''s confirmation message depends on how far along that chain got. The page and the pipeline are one system with one failure surface.

## Slow pages produce worse data, not just fewer submissions

The obvious cost of a slow form is abandonment. The less obvious one is that the submissions you do get are lower quality.

People on a page that is fighting them rush. They skip optional fields, mistype, pick the first option rather than the right one, and abandon halfway and resubmit — producing the duplicate that the deduplication logic then has to handle. Every one of those lands in the automation as an exception to be sorted out by a person later.

Improving the page does not only increase volume. It reduces the proportion of records that need fixing.

## Validation placed early saves work everywhere downstream

A malformed phone number caught in the browser is a moment of friction. The same number caught at the messaging provider three steps later is a failed delivery, a retry, a log entry, and eventually someone investigating why a customer was not contacted.

The cheapest place to reject bad input is the closest place to where it was typed — as long as the same rule also runs on the server, because client-side checks are a convenience rather than a control.

- Same schema on the client and the server, defined once
- Reject early, with a message that says what to change
- Normalize formats on the way in, not in every consumer
- Store what was actually submitted alongside the normalized version

## The response the visitor sees is an architectural decision

If the confirmation message waits for every downstream system to accept the record, then the page is only as fast and as available as the slowest of them, and an outage at a third party becomes a visible failure on your site.

Writing to your own storage first and confirming from that write decouples the two. The visitor gets a fast, honest confirmation; delivery happens afterwards and can be retried. This single decision is usually worth more than any amount of front-end optimisation, because it removes an entire dependency from the critical path.

## Instrument the whole path, not the halves

Page analytics tell you about submissions. Pipeline logs tell you about deliveries. Neither answers the question that matters: of the people who tried, how many ended up as a record someone acted on?

Carrying one identifier from the form through to the delivery record makes that question answerable. Without it, a drop-off between the two halves is invisible — each side reports itself as healthy.

## One owner, or the seam rots

The practical failure mode is organisational. When the page and the pipeline have different owners, the seam between them belongs to nobody, and that is exactly where the interesting bugs live.

Someone should be able to answer what happens to a submission from keystroke to CRM record. If nobody can, the gap is not in the code.

## Third-party scripts are part of the pipeline now

Analytics, chat widgets, tag managers and pixels all run in the same page as the
form. Each is an external dependency in the critical path of a conversion, and
each can be slow or unavailable independently of your own infrastructure.

The failure is rarely total. It is a script that takes four seconds to load and
blocks interaction while it does, on a page whose entire purpose is a form
submission. Load them after the page is usable, and know which ones would take
the form down with them if they failed.

## Mobile is where the cost lands

Most of the difference between a fast page and a slow one shows up on a phone on
a mediocre connection, which is a large share of real traffic and almost none of
the testing.

Test the form on a throttled connection on an actual device. The gap between
that experience and the one on a developer''s machine is usually where the
abandoned submissions are, and it is invisible from the desk where the page was
built.

## Failure states deserve design attention

Most forms are designed for the successful path. The interesting states are the
others: what a validation error looks like, what happens when the network drops
mid-submission, whether a retry produces a duplicate, whether the visitor can
tell the difference between "still working" and "stopped".

These are the moments where a person decides whether to try again or leave, and
they are usually the least designed part of the page.

## One owner, or the seam rots

The practical failure mode is organisational. When the page and the pipeline
have different owners, the seam between them belongs to nobody — and that is
exactly where the interesting bugs live.

Someone should be able to answer what happens to a submission from keystroke to
CRM record. If nobody can, the gap is not in the code.', '', '["Website Performance","Automation","Conversion"]',
  'DevLab Studios', '2026-07-03', 4,
  0, 120, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'what-breaks-first-in-an-automation', 'what-breaks-first-in-an-automation', 'What breaks first in an automation, and why it is never the AI', 'Automations rarely fail because a model got something wrong. They fail on credentials, schema drift, volume, and assumptions about the world that quietly stopped being true.',
  'Reliability', 'ops-note', 'AlertTriangle', '["Credentials","Schema drift","Volume","Time"]',
  '## The model is rarely the first thing to go

When an automation that worked for months stops working, the instinct is to look at the interesting part. In practice the interesting part is usually fine and something mundane has moved underneath it.

Four things account for most of it.

## Credentials expire, and they expire quietly

Tokens have lifetimes. Keys get rotated during unrelated security work. An account gets deprovisioned when someone leaves, taking with it the integration that was connected under their login.

The failure is abrupt and total, and it presents as a permanent authentication error rather than anything resembling the business logic. Two habits prevent most of the pain: connect integrations under a service account rather than a person, and record expiry dates somewhere that produces a reminder before they arrive.

## Schemas drift without announcement

An upstream system adds a field, renames one, changes a type from string to number, or starts returning null where it never did. None of these are breaking changes from the provider''s perspective and all of them can break a consumer that assumed a shape.

Validating what arrives — not just what you send — turns this from a mysterious downstream corruption into a clear rejection at the boundary, with the offending payload kept for inspection. That is the difference between an hour and a day.

## Volume grows past an assumption nobody wrote down

Pagination that was never needed because results always fit on one page. A rate limit that was never approached. A batch job sized for the volume at build time. A plan tier with a monthly ceiling.

These fail suddenly and at the worst moment, because they fail when things are going well. Worth checking at build time: what happens at ten times the current volume, and what is the first limit reached?

- Is every list endpoint paginated, or does it assume one page?
- What is the rate limit, and what happens when it is hit?
- Does the job have a time budget it could exceed as data grows?
- Which plan limit is nearest, and who is told when it is approached?

## Time is a recurring source of wrong

Timezones, daylight saving, month boundaries, and leap days break scheduled work with reliable regularity. A cron expression is interpreted in some timezone, and if nobody wrote down which, the first surprise arrives when the clocks change.

Related and just as common: a job that assumes it runs exactly once, then runs twice after a retry, or skips a day because the previous run was still going.

## The failure that is worst is the one that looks like success

Everything above announces itself. The dangerous category is the automation that continues running, reports success, and produces nothing — a filter that now matches zero rows, a sync pointed at an empty source, a model call whose output is being discarded by a parser that no longer matches its shape.

Guard against it by asserting expectations rather than only catching errors. If a run normally processes between ten and a thousand records, a run that processes zero should be loud. Silence is not evidence that it worked.

## Maintenance is a scheduled activity, not an event

Every integration ages. Credentials, dependencies, plan limits, and upstream APIs all move. Automations that get looked at on a schedule degrade gracefully; ones that only get looked at when someone complains degrade until someone complains.

## Retries can cause the damage they were meant to prevent

Retrying a transient failure is correct. Retrying an operation that already
partially succeeded is how one invoice becomes three.

The distinction is idempotency: whether running the same operation twice
produces the same result as running it once. Achieve it with a key derived from
the operation itself, so a duplicate collapses into the original by construction
rather than by a check that might race.

Where you cannot make an operation idempotent, do not retry it automatically.
Surface it for a person, who can look before deciding.

## Partial failure is the normal case

A workflow that touches four systems has, in practice, sixteen possible
outcomes, not two. The interesting ones are in the middle: the CRM accepted it
and the email failed, or the record was created and the status update was not.

Decide what each partial state means. Which steps must succeed together, which
can be retried independently, and what a half-completed run should leave behind.
A workflow that only handles "all worked" and "nothing worked" will eventually
leave a record in a state nobody designed, and someone will find it weeks later.

## Watch the trend, not just the threshold

Most monitoring alerts on a threshold: error rate above some number. That
catches the cliff and misses the slope.

A gradual rise in one error category over three weeks is usually the earliest
signal of something real — a growing dataset, an upstream slowly changing, a
limit being approached. Looking at counts by category over time, even briefly
and manually, catches things no threshold would have fired on.

## Keep a list of what could break

Write down the integrations, their credentials, their expiry dates, their rate
limits and their plan ceilings. Keep it with the runbook.

It takes an hour and turns the most common class of outage — something expired,
something hit a limit — from an investigation into a lookup. It also makes the
question "what are we exposed to" answerable, which it otherwise is not.', '', '["Reliability","Operations","Maintenance"]',
  'DevLab Studios', '2026-08-21', 4,
  0, 130, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'the-cost-of-a-silent-failure', 'the-cost-of-a-silent-failure', 'The cost of a silent failure', 'A system that breaks loudly costs an afternoon. One that breaks quietly costs however long it takes someone to notice — and the damage compounds the whole time.',
  'Reliability', 'ops-note', 'AlertCircle', '["Detect","Assert expectations","Fail loudly","Report honestly"]',
  '## Loud failures are the cheap ones

An automation that throws an error and stops is doing you a favour. Someone sees it, the cause is near the symptom, and the blast radius is bounded by the thing not having run.

The expensive failure is the one that keeps reporting success. Leads that stop arriving. A sync that runs nightly against a source that is now empty. A summary step whose output is being thrown away by a parser that no longer recognises its shape. Nothing errors. Dashboards stay green. The cost accumulates for as long as it takes someone to notice by other means.

## Catching an error is not the same as handling it

The most common source of silent failure is a catch block that swallows. It usually starts as a reasonable defensive move — one flaky step should not take down the run — and then quietly becomes the reason nobody knows the step has been failing for a month.

Every swallowed error should do at least one of three things: record itself somewhere countable, surface in the result the caller receives, or change a status that someone looks at. A catch that does none of those is a decision to not know.

## Assert what you expect, not just what must not throw

Error handling protects against the run crashing. It does not protect against the run completing and doing nothing. For that you need an expectation.

If a job normally processes between ten and a thousand records, zero is an anomaly worth raising even though nothing failed. If a step normally produces a value, an empty value is worth recording distinctly from an error, because they have different causes and different fixes.

- Expected range, and what happens outside it
- Zero results: anomaly or legitimate?
- Empty output distinguished from failed output
- Last successful run, visible somewhere

That last one is the single highest-value signal: a timestamp that says when this last genuinely worked. Freshness is the check that catches every silent failure at once, including the ones nobody predicted.

## Report the outcome you actually had

A status that flattens several outcomes into one loses the information needed to diagnose. "Did not work" covers the upstream being down, a credential expiring, the input being malformed, and the output being unreadable — four different problems with four different fixes.

Worse, a message that names the wrong cause sends the next person down the wrong path. A label saying a service was unavailable, when in fact it answered and the answer was discarded, is more expensive than no label at all, because it is confidently misleading.

Report the outcome you observed, not the one you assumed. If you do not know which it was, say that.

## Degrade visibly

Graceful degradation is a good property and a dangerous habit. Falling back to a default is right when the alternative is an outage. It is wrong when nobody can tell the fallback is in use.

The pattern that works: degrade in behaviour, but record that you degraded. The page still renders, the digest still publishes, the form still submits — and a counter somewhere says how often the good path was not taken. Without that counter, the fallback becomes the permanent state and nobody finds out.

## A cheap test worth running

Pick an automation and break it deliberately in a staging environment. Revoke a credential, empty the source, make the upstream return an unexpected shape.

Then ask: how would we have found out? If the honest answer is a person eventually noticing something missing, that is the gap. It is far cheaper to find it on purpose than to find it in the middle of a month when nobody was looking.

## Freshness beats almost every other signal

If you add only one check, add the timestamp of the last successful run, with a
threshold for how old is too old.

It catches every silent failure at once, including the ones nobody predicted: the
trigger that stopped firing, the filter that now matches nothing, the credential
that expired, the schedule that was quietly disabled. It requires no
understanding of why something broke, only that it has not worked since Tuesday.

## Put it where someone will actually see it

An alert into a channel nobody reads is documentation, not monitoring. So is a
dashboard opened once a quarter.

Route it to where the affected work happens — the inbox of the person who
depends on the output, the channel the team already watches. And make the
message say what to do, not only what happened. An alert nobody knows how to act
on gets muted, and a muted alert is worse than none because it creates the
impression of coverage.

## Count the fallbacks

Every graceful degradation needs a counter. How many times today did the code
take the safe path instead of the good one.

Without it, degradation is indistinguishable from normal operation, and the
fallback becomes permanent. With it, "the summaries have been empty for a week"
is a number on a chart rather than something a person eventually notices.

## Reconcile against the source occasionally

For anything that syncs, periodically compare counts at both ends. How many
records exist upstream, how many downstream, and does the difference have an
explanation.

This is the check that catches drift no per-run error handling can see, because
every individual run succeeded. It is also the one that finds the records lost
during an incident three months ago that nobody realised had been lost.', '', '["Reliability","Monitoring","Operations"]',
  'DevLab Studios', '2026-09-04', 4,
  0, 140, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO articles (
  id, slug, title, summary, category, content_type, icon, points, body_markdown,
  cover_image_url, tags_json, author_name, published_at, reading_time_minutes,
  is_featured, sort_order, status, created_at, updated_at
) VALUES (
  'choosing-what-not-to-automate', 'choosing-what-not-to-automate', 'Choosing what not to automate', 'Not every repetitive task should be automated. The ones that should not are identifiable in advance, and skipping them is what keeps the rest maintainable.',
  'Strategy', 'ops-note', 'ClipboardList', '["Low frequency","Unstable rules","Judgement-heavy","Unclear ownership"]',
  '## Automation has an ongoing cost

The build cost is visible and gets estimated. The ongoing cost usually does not: an automation is a small piece of infrastructure that has to be monitored, updated when an upstream changes, re-credentialed, and understood by whoever inherits it.

That cost is worth paying many times over for the right workflows. For the wrong ones it quietly exceeds the manual effort it replaced, and it does so in a form nobody is tracking.

## Frequency has to clear the maintenance bar

A task done twice a year takes a few minutes each time. Automating it costs a day to build and then needs to still work six months later, by which point the upstream API has moved and nobody remembers how it was set up.

The arithmetic that matters is not build cost against time saved. It is build cost plus maintenance against time saved over a realistic horizon. Low-frequency tasks frequently lose that comparison, and the honest answer is a good checklist instead.

## Unstable rules are a moving target

If a process changes shape every few weeks — new exceptions, new approvers, a rule that depends on this quarter''s priorities — automating it means rebuilding it every few weeks.

Wait for it to settle. A process that has held its shape for a few months is a candidate. One still being argued about is a specification that has not been written yet, and encoding it just moves the argument into a tool where it is harder to see.

## Judgement-heavy work resists the useful part

Some tasks look repetitive but are actually a person applying context each time — knowing this client is sensitive about timing, that this request is a follow-up to a bad experience, that the exception is warranted this once.

Automating the mechanical shell of that work while removing the context usually produces something technically correct and situationally wrong. The better move is to automate the parts around it: assemble the information, draft the option, and leave the decision with the person.

- Does the same input reliably produce the same correct output?
- If not, what is the person using that the system would not have?
- Can that context be supplied, or does it live in their head?
- What does being wrong cost here?

## No owner means no automation

If nobody will own it after launch, it should not be built. Unowned automation does not fail immediately — it fails in three months, invisibly, and whoever depends on it discovers the failure downstream of some other problem.

"Owner" here means a specific person who would be told if it stopped, not a team name. If that person cannot be named before the build starts, that is the answer.

## Documenting beats automating more often than people expect

A written procedure with the exact steps, the actual field values, and the edge cases is fast to produce, needs no credentials, does not break when an API changes, and can be followed by anyone.

For infrequent, unstable, or judgement-heavy work it is usually the better tool. Choosing it is not a failure to automate. It is the same analysis, reaching a different answer — and it leaves the automation budget for the workflows that will actually repay it.

## Ask what the process is for before automating it

Some steps exist because of a constraint that no longer applies — a system that
was replaced, an approval for a risk that has passed, a report nobody reads.
Automating those makes a redundant step permanent and harder to remove, because
it is now in a tool rather than in a habit.

Before building, ask what each step is for and who consumes its output. The
answer is occasionally that nobody does, and deleting a step is a better outcome
than automating it.

## Partial automation is a real answer

The choice is not between fully automated and fully manual. Most of the value
often sits in the boring middle: gather the information, pre-fill the form,
assemble the draft, then stop and let a person decide.

This shape is cheaper to build, much cheaper to maintain, and keeps judgement
where judgement belongs. It also tends to be where the actual time goes — the
decision is usually quick, and the gathering is what takes twenty minutes.

## Beware the process that is really a conversation

Some workflows look like data movement and are actually negotiation: chasing a
late invoice, handling a complaint, agreeing a delivery date. The steps can be
described, but what makes them work is the person reading the situation.

Automating the visible steps while removing the reading produces something
technically correct and relationally wrong. Automate the record-keeping around
the conversation instead, and leave the conversation alone.

## Write the decision down either way

Whichever way it goes, record it: what was considered, what was decided, and
why. Otherwise the same proposal returns every six months and gets re-argued
from scratch by people who do not know it was already examined.

A short note saying "we looked at automating this in March and chose a checklist
because it runs twice a year" saves that whole conversation, and makes it easy
to revisit properly if the frequency changes.', '', '["Strategy","Operations","Decision Making"]',
  'DevLab Studios', '2026-09-15', 4,
  0, 150, 'published',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  category = excluded.category,
  content_type = excluded.content_type,
  icon = excluded.icon,
  points = excluded.points,
  body_markdown = excluded.body_markdown,
  tags_json = excluded.tags_json,
  author_name = excluded.author_name,
  published_at = excluded.published_at,
  reading_time_minutes = excluded.reading_time_minutes,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  status = excluded.status,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Only the library's featured article stays featured; anything previously
-- flagged in the CMS is cleared, so the page cannot pick a stale one.
UPDATE articles SET is_featured = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE is_featured = 1 AND id <> 'ai-automation-small-business-workflows';

UPDATE articles SET content_type = 'ai-update', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE content_type = 'news';
UPDATE articles SET content_type = 'ops-note', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE content_type = 'insight';
