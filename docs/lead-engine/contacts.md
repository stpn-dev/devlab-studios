# Contacts

Code: `src/lead-engine/contacts/discover.js` (selection and ranking) and
`contacts/validate.js` (syntax, domain, MX). Extraction happens in
`signals/extract.js`. Storage: `lead_contacts`. Policy: `CONTACTS` in
`config/defaults.js`.

## MX presence is NOT mailbox verification

Stated up front because it is the claim most likely to be misread.

`lead_contacts.mx_present` records **one thing**: that the address's domain
publishes MX records in DNS. That is all. Specifically it does **not** mean:

- that the mailbox exists;
- that the mailbox accepts mail;
- that the address will not bounce;
- that the address is monitored by anybody.

A domain can publish MX records and reject every address at it. A domain can
publish MX records for a mail server that has been decommissioned.

Nothing in this system calls an address "verified", because we have not verified
it, and a label claiming otherwise would make a human trust a bounce-prone
address. `describeMxState()` is the single function that turns the column into
words, centralized so no screen can independently decide to say something
stronger:

| `mx_present` | Operator-facing text |
|---|---|
| `true` | `Domain accepts mail (MX records found — not a mailbox check)` |
| `false` | `Domain publishes no MX records` |
| `null` | `Not checked` |

### What the lookup actually does

`lookupMx()` queries **DNS-over-HTTPS** at `https://cloudflare-dns.com/dns-query`
with a 5-second timeout. DoH rather than a DNS library because Workers has no UDP
socket and therefore no conventional resolver; Cloudflare's own resolver because
it is already the network this Worker runs on.

**There is no SMTP probing.** Connecting to a mail server to ask whether an
address exists is both unreliable from a Worker and rude to the receiving server.
There is no paid validation service either.

The three-way return is the important part:

| Result | `present` | Meaning |
|---|---|---|
| MX records found | `true` | The domain publishes at least one real MX target |
| `Status: 3` (NXDOMAIN) | `false` | The domain does not exist, so it cannot accept mail — a genuine answer |
| No MX records in the answer | `false` | Genuinely none published |
| RFC 7505 null MX (a single `.` target) | `false` | The domain **explicitly announces it accepts no mail**. Reading that as "has MX records" would be exactly backwards. |
| Resolver HTTP error, unparseable body, non-zero non-3 status, timeout | **`null`** | Could not determine |

`null` is not `false`, and the distinction is the point: a resolver timeout must
not be recorded as "this domain does not accept mail", which would take a
perfectly good lead out of the pipeline.

CNAME records that appear in the `Answer` array on the way to the MX are filtered
out by type (MX is type 15). At most 5 records are kept.

The lookup is the only network call in `validateContact`, so it is opt-out
(`checkMx: false`) — batch re-validation of existing contacts does not need to
re-resolve every domain.

## Provenance is the admission requirement

Not metadata. Not a nice-to-have. An **admission requirement**.

`lead_contacts.source_url` and `lead_contacts.source_type` are `NOT NULL`. A
stored contact always carries the URL it was observed on and what kind of page
that was. An address whose public source cannot be pointed at is not one to email
a stranger at, and it cannot be explained later.

`source_type` is a closed `CHECK` list:

`company_contact_page` · `company_about_page` · `company_team_page` ·
`company_homepage` · `company_other_page` · `structured_data` · `source_record` ·
`manual_entry`

**There is no `inferred` value, by design.** A guessed address has nowhere to be
stored.

Provenance is enforced in three places:

1. The schema (`NOT NULL`, closed enum).
2. `services/outreach.js` `checkOutreachReadiness()` — condition 4 of the
   six-condition gate blocks with `contact_provenance` if `sourceUrl`,
   `sourceType` or `publishedPublicly` is missing.
3. The compliance profiles — `contact_provenance_recorded` is a required check in
   **both** the US and PH profiles, so a contact without it holds the lead at
   `needs_human_review` rather than passing.

## No guessed addresses

There is no code path that constructs an address.

- No `firstname.lastname@domain.com` generation.
- No `first initial + last name` pattern application.
- No "this company uses `{first}@{domain}`, so infer the rest" logic.
- No third-party email-finding or enrichment API.
- No social profiles are read. Social hosts are rejected at discovery
  normalization, and `contacts/discover.js` never fetches anything.

`classifyEmailType()` contains a regex that recognises a person-shaped local part
(`jane`, `jane.doe`, `jdoe`). Read the comment beside it: that is **only ever a
classification of an address we already observed** — it never generates one.

Every stored address was seen, as text or as a `mailto:` href or in JSON-LD, on a
page the company itself publishes and the crawler actually fetched.

## Discovery runs after qualification

`contacts/discover.js` runs only after a lead has been researched, and the full
contact write happens inside `services/research.js` **after** signals are
extracted — with `services/aiReview.js` re-reading them later.

That ordering is a **data-minimization decision**, not a performance one.
Extracting and storing a business's contact details is the point at which this
system starts holding information about a specific organization it might email,
and there is no reason to do that for a lead that will never be contacted.

(In practice `research.js` stores contacts before scoring, because
`contactability` is one of the four scoring categories and a contact found during
this crawl should count toward it. The lead has already been crawled and is a
candidate at that point.)

## What is extracted

`signals/extract.js` collects addresses from three places, in ascending strength:

1. **Prose** — `EMAIL_PATTERN` over the page's visible text.
2. **`mailto:` links** — a mailto beats a prose match, and overwrites a weaker
   earlier sighting of the same address.
3. **JSON-LD structured data** — `entity.email` or `entity.contactPoint.email`,
   recorded as `source_type: 'structured_data'`.

`isPlausibleBusinessEmail()` runs before anything is stored, filtering
`NON_CONTACT_EMAIL_PATTERNS`:

| Pattern | Why |
|---|---|
| `@example.com`, `@test.*`, `@yourdomain.*`, `@company.*`, `@sentry.io`, `@wixpress.com` | Template placeholders |
| `your@`, `you@`, `name@`, `firstname@`, `user@`, `sample@`, `test@` | Ditto |
| `@2x.` | A retina-image filename that looks like an address |
| Ends in `.png`/`.jpg`/`.css`/`.js`/… | Asset paths matched by the email regex |
| 20+ hex characters as the local part | Machine-generated |

Placeholder addresses matter more than they look: a template site that never had
its placeholder replaced will happily hand over `you@example.com`, and storing it
would produce a lead that looks contactable and is not.

## What is never stored

`CONTACTS.excludedLocalParts` — `isStorableContact()` refuses these outright, with
reason `role_not_business_development:<localPart>`:

```
abuse  postmaster  noreply  no-reply  donotreply  privacy  dmca
security  webmaster  hostmaster  unsubscribe  legal  careers  jobs
```

These are not business-development contacts. Emailing `abuse@` or `privacy@` a
cold sales pitch is a specific kind of mistake this list exists to prevent.

Also refused: a local part that is 16+ hex characters
(`machine_generated_address`) — almost always a per-visitor tracking or ticketing
address rather than a way to reach a person.

## Address types and preference

`classifyEmailType(email, companyDomain)`:

| Type | Definition |
|---|---|
| `role` | Local part is in `CONTACTS.preferredLocalParts`: `hello`, `info`, `contact`, `sales`, `operations`, `admin`, `enquiries`, `inquiries`, `office` |
| `named` | Person-shaped local part **at the company's own domain** |
| `generic` | Everything else |

**`role` is preferred throughout the engine.** Two reasons, and both matter:

1. It is unambiguously published for business contact.
2. It means this system holds a **mailbox rather than a named individual**, which
   is both the smaller privacy footprint and the more durable address.

## Ranking

`rankContacts()` sorts by a four-element tuple, ascending, then alphabetically by
address for stability:

1. Address is at the company's own canonical domain (0) or not (1).
2. `role` (0) < `generic` (1) < `named` (2).
3. `SOURCE_TYPE_RANK`: `structured_data` (0) < `company_contact_page` (1) <
   `company_about_page` (2) < `company_team_page` (3) < `company_homepage` (4) <
   `company_other_page` (5) < `source_record` (6) < `manual_entry` (7).
4. Found via a `mailto:` link (0) or not (1).

A contact page publishing an address is unambiguous. The same address in a blog
post's footer is weaker evidence of "this is how to reach us", even though it is
the same string.

At most `CONTACTS.maxContactsPerLead` (5) are kept. The first becomes
`is_primary`, and `getPrimaryContact` is what the outreach gate and the exported draft
action read.

`selectContacts()` puts site-observed addresses **before** `sourceRecordEmails`,
so a directory's stale listing never outranks what the company publishes itself
today. (`services/research.js` currently passes no `sourceRecordEmails` — the
parameter is the seam where a directory-supplied address would be merged in.)

## Syntax validation

`checkSyntax()` is **deliberately stricter than RFC 5321**. The RFC permits
quoted local parts, comments and IP-literal domains; none of those appear on a
business contact page, and accepting them only widens what can be stored.

| Reason | Rule |
|---|---|
| `unparseable` | `normalizeEmail` could not read it |
| `local_part_length` | Empty or > 64 |
| `domain_length` | Empty or > 253 |
| `local_part_characters` | Not `^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?$` |
| `consecutive_dots` | `..` in the local part |
| `domain_not_qualified` | Fewer than two labels |
| `domain_labels` | A label is not a valid LDH label |
| `tld` | TLD is not 2–24 letters — a numeric TLD is an IP-literal shape, not a domain |

`normalizeEmail()` (in `domain/domains.js`) lowercases the **whole** address,
including the local part. RFC 5321 says the local part is case-sensitive, but no
mail provider in practice treats it that way — and for **suppression** the
permissive reading is the correct one: if someone at `Info@example.com` asks not
to be contacted, `info@example.com` must be suppressed too. It also strips a
display name from `Jane Doe <jane@example.com>`.

A contact that fails syntax validation is **not stored at all**
(`services/research.js` `continue`s past it).

## Domain match

`domainMatchesCompany()` is **not** a validity check — a small business genuinely
publishing a Gmail address is contactable. It is the strongest available signal
that the address belongs to the business we think it does, and it is the first
ranking key.

A subdomain counts: `mail@mail.example.com` is still `example.com`.

## Manual entry

An operator can add a contact by hand via
`POST /api/admin/lead-crm/leads/:id/contacts`, producing
`source_type: 'manual_entry'` and a `CONTACT_ADDED_MANUALLY` activity row.

The provenance requirement still applies — a source URL must be supplied, and the
compliance check reads the same columns. Manual entry is the resolution for a
lead sitting at `NO_CONTACT` ("Add a public business contact manually, or
archive"), not a way around the rules.

## Honest limitations

- **A published address is not a person who wants to hear from you.** This system
  can tell you that `info@` was published on a contact page. It cannot tell you
  whether anyone reads it, whether it routes to a shared inbox nobody monitors, or
  whether the business would welcome the message. That judgement stays with the
  operator.
- **Bounces are not detected automatically.** `lead_suppression` has a
  `hard_bounce` reason and the pipeline has a `BOUNCED` stage, but nothing parses
  bounce messages from the Zoho inbox. A bounce is currently something the
  operator notices in your mail client and records by hand (Suppression screen, or the lead's
  `do_not_contact` action). Anything claiming automatic bounce handling would be
  wrong.
- **The MX check is per contact at discovery time.** It is not re-run on a
  schedule, so `mx_present` can be stale.
- **Role-address preference has a cost.** `hello@` and `info@` are the addresses
  most likely to be filtered, ignored, or answered by whoever is least equipped
  to evaluate the message. That is an accepted trade for the smaller privacy
  footprint and the honest provenance story.
