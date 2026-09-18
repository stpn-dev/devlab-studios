# Crawler

Code: `src/lead-engine/crawler/` — `ssrf.js`, `robots.js`, `fetchPage.js`,
`crawlSite.js`, `browserRun.js`. Policy values: `CRAWLER` in
`src/lead-engine/config/defaults.js`. Public disclosure page:
`src/pages/crawler.astro`, served at `/crawler`.

The crawler is a guest on someone else's server. Every limit below exists
because the alternative is either a site operator with a legitimate complaint, or
a Worker that a remote server can hang, flood or point at an internal address.

## What it does NOT do

Stated first, because it is the shorter and more important list. This matches
what `/crawler` tells site operators, and it is enforced by the absence of code
rather than by configuration:

- **It does not log in, create accounts, or access anything behind a login.**
  There is no credential store and no authentication code in the crawler.
- **It does not submit forms.** `fetchPage` issues `method: 'GET'` only. It
  detects that a form exists; it never interacts with one.
- **It does not attempt to bypass CAPTCHAs, bot protection or a firewall.** A
  site that refuses us is recorded as refused and left alone.
- **It does not rotate its identity or its address.** One user agent, no proxy
  pool, no retry-with-a-different-fingerprint.
- **It does not retry past a block.** `handlers.js` classifies a robots
  disallow as permanent, so the job dead-letters instead of hitting the server
  twice more.
- **It does not read social media accounts or build personal profiles.**
  Social hosts are rejected at normalization; `contacts/discover.js` never reads
  a social profile.
- **It does not store copies of pages.** `services/research.js` strips `html`
  from every page before writing `lead_crawl_runs.pages_json`. What survives is
  the URL, status, content type, byte count, whether the page was used — and,
  per signal, a 240-character evidence excerpt.
- **It does not crawl off-site.** Redirects and links must stay on the same
  registrable domain.
- **It does not follow sitemaps or do a breadth-first crawl.** Four pages,
  chosen by priority.
- **It does not execute JavaScript** on the normal path. Browser Run is a
  separate, budgeted, three-condition fallback.

## The transparent user agent

```
DevLabResearchBot/1.0 (+https://www.devlabstudios.com/crawler)
```

Sent on every crawler request, on every robots.txt fetch, on every Overpass
request, and by Browser Run. It is a single constant, `CRAWLER.userAgent`.

A transparent user agent is only transparent if the URL it names actually
explains something. `/crawler` is a real page that states what the bot does, what
it does not do, and how to block it:

```
User-agent: DevLabResearchBot
Disallow: /
```

It also gives a human route out — email `hello@devlabstudios.com` to be added to
the do-not-contact list, no reason required. The page deliberately says nothing
about internal architecture, rate-limit values, or which sources are configured.
What a site operator needs is behaviour and an opt-out.

Browser Run presents **the same** user agent, not a real-browser string. A
fallback that misrepresented who is asking would defeat the point of having a
transparent identity at all.

## robots.txt

`src/lead-engine/crawler/robots.js`. A deliberately conservative subset of
RFC 9309. Where the spec leaves latitude, the restrictive reading is taken: the
cost of skipping a page we were allowed to fetch is one missing signal; the cost
of fetching a page we were told not to is a complaint.

### Fetch outcomes

| robots.txt response | Verdict | Why |
|---|---|---|
| 2xx | Parsed and applied | Normal |
| 4xx (404, 403, …) | **Allowed** | Per the spec, a 4xx means no restrictions are published |
| **5xx** | **Disallowed** | A server that is failing is not a server to crawl. Refusing also stops us adding load to something already in trouble. |
| **Network failure or timeout** | **Disallowed** | Same reasoning |

That is the **fails-closed** behaviour: the two cases where we *cannot know* the
answer are treated as "no".

A disallowed site produces `status: 'skipped'` with
`skipReason: 'robots_disallowed:<status>'` on `lead_crawl_runs` — recorded, never
a silent nothing-happened. The status value distinguishes `server_error` from
`unreachable` from a genuine `Disallow`.

### Parsing

- A group matching our user-agent token wins over `*`, per the spec. Matching is
  a substring test, because robots.txt tokens are matched as a prefix of the
  product token — `DevLabResearchBot` in the file matches our full
  `DevLabResearchBot/1.0 (...)` string.
- Consecutive `User-agent:` lines share one group; a `User-agent:` line *after* a
  rule line begins a new group. Getting this wrong merges `*`'s rules into a
  specific agent's group, which is how a crawler ends up ignoring a `Disallow`
  meant for it.
- **Longest match wins; `Allow` wins a tie.** Both are the spec's rules. The tie
  behaviour matters in practice because `Disallow: /` plus `Allow: /` is a common
  way of saying "yes, crawl this".
- `*` wildcards and a trailing `$` anchor are supported. Everything else
  regex-significant in a path is escaped.
- An empty `Disallow:` means "allow everything" and carries no path.
- No matching rule means allowed — the protocol's default, and the only reading
  under which a robots.txt that mentions only other crawlers does not
  accidentally block us.
- The file is read to at most 200 000 characters. Anything enormous is either not
  a robots.txt or is trying to make us buffer it.

### Crawl-delay

Honoured, capped at 30 seconds, and applied **only upward**:

```js
const delayMs = Math.max(limits.perDomainDelayMs, robots.crawlDelayMs ?? 0)
```

We do not crawl faster than our own 1-second floor because a site said we could.

One robots.txt fetch per site per run, cached for the run's duration.

## SSRF guards

`src/lead-engine/crawler/ssrf.js`. The crawler fetches URLs that came from
**outside** this system — a directory listing, a search result, a CSV an operator
pasted in, a redirect a remote server chose. Any of those can point at
`http://127.0.0.1:8787/api/admin/...` or a cloud metadata endpoint.

`checkUrlSafety` returns a result rather than throwing, because "this URL is not
safe" is an ordinary crawl outcome recorded as a skip reason.
`assertSafeUrl` is the throwing variant for the fetch path.

Refusal reasons, in evaluation order:

| Reason | Rule |
|---|---|
| `not_a_url` | Does not parse |
| `blocked_protocol:<scheme>` | Only `http:` and `https:` are ever fetched |
| `embedded_credentials` | `user:pass@` — never legitimate, and would be sent to the remote host |
| `missing_host` | — |
| `blocked_host:<name>` | `localhost`, `localhost.localdomain`, `ip6-localhost`, `ip6-loopback`, `metadata`, `metadata.google.internal`, `metadata.goog`, `instance-data` |
| `blocked_host_suffix` | `.localhost`, `.local`, `.internal`, `.localdomain`, `.home.arpa`, `.onion` |
| `cloud_metadata_endpoint` | `169.254.169.254` exactly — called out separately from the range only so the refusal message is specific |
| `private_ip` | IPv4: `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16–31`, `192.168/16`, `192.0/16`, `198.18–19`, `100.64–127` (CGNAT), `≥224` (multicast/reserved). IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, and IPv4-mapped `::ffff:127.0.0.1` |
| `ip_literal` | Any bare IP, **including a public one** — not a business website we can identify or canonicalize |
| `non_public_hostname` | A hostname with no dot |
| `invalid_port` | Out of range |
| `blocked_port:<n>` | 22, 23, 25, 110, 143, 445, 993, 995, 1433, 1521, 2049, 3306, 3389, 5432, 5984, 6379, 8020, 9042, 9200, 11211, 27017 |

IPv4 octets are validated as canonical (`1.2.3.999` is not treated as a safe IP),
and the IPv4-mapped IPv6 form is handled explicitly because it is the standard
way to smuggle a loopback address past a naive IPv4-only check.

### Honest limitation: DNS rebinding

**DNS rebinding is not fully solved here, and cannot be from inside a Worker.**
There is no API to resolve a hostname and then connect to that resolved address,
so a hostname that resolves to a public address at check time and a private one
at connect time would slip through.

What mitigates it in practice is that Cloudflare Workers' `fetch` does not route
to RFC1918 space from the edge at all. The literal checks above are what protect
local `wrangler dev` and any future non-Worker runtime, and they are cheap enough
to keep regardless. This is stated in the module comment in `ssrf.js` and is not
a gap anyone should be surprised by later.

## Redirect validation

Redirects are followed **manually** — `redirect: 'manual'` in `fetchPage`. That
is the whole point: the runtime would happily follow a redirect to
`http://169.254.169.254/`, and the SSRF check has to run against **each hop**.

`checkRedirect(from, to, isSameSite)` requires two conditions, both:

1. The target independently passes `checkUrlSafety`. A remote server choosing to
   redirect us at a metadata endpoint is exactly the attack this exists for, and
   the attacker controls it at *request* time rather than discovery time.
2. It stays on the same **registrable domain**. The page budget belongs to the
   site we were pointed at. An off-site redirect is recorded
   (`offsite_redirect`) and not followed.

`maxRedirects` = 3, after which `too_many_redirects`. A 3xx with no `Location`
header is `redirect_without_location`.

Note that same-*site* comparison is by registrable domain, not exact hostname, so
`example.com` → `www.example.com` and → `booking.example.com` are followed. That
is intentional: those are the same business.

## Size, timeout and content-type limits

| Limit | Value | Where |
|---|---|---|
| Pages per site per run | **4** | `CRAWLER.maxPagesPerSite` |
| Response bytes | 1 500 000 | `CRAWLER.maxResponseBytes` |
| Request timeout | 10 000 ms | `CRAWLER.requestTimeoutMs` |
| Redirect hops | 3 | `CRAWLER.maxRedirects` |
| Per-domain delay | 1000 ms | `CRAWLER.perDomainDelayMs` |
| Sites crawled concurrently | 2 | `CRAWLER.concurrency` / `CONCURRENCY.crawl` |
| Accepted content types | `text/html`, `application/xhtml+xml` | `CRAWLER.acceptedContentTypes` |
| Evidence excerpt | 240 chars | `CRAWLER.evidenceExcerptLength` |
| Client-rendered threshold | 400 chars of visible text | `CRAWLER.clientRenderedTextThreshold` |

### Why four pages

Four covers homepage + contact + services + about, which is where every signal
this engine needs actually lives — and it is few enough that crawling a hundred
businesses is a few hundred requests rather than a few thousand.

Link discovery is therefore **not** a breadth-first crawl. The homepage is
fetched, its links are scored against `CRAWL_PATH_PRIORITY`, and the best three
are queued. `scoreLink` considers both the path and the visible anchor text —
plenty of sites use `/get-in-touch` rather than `/contact`, and the anchor text
is what identifies it. An explicit path match always beats a text match (text
hints are offset past the priority list length).

`CRAWL_PATH_PRIORITY`: `/`, `/contact`, `/contact-us`, `/services`, `/about`,
`/about-us`, `/owners`, `/team`, `/book`, `/request-quote`, `/pricing`,
`/locations`.

### How the byte limit is actually enforced

`readBounded` reads the body **chunk by chunk** and abandons the stream once the
ceiling is passed. `response.text()` would buffer the whole body first and only
then let us check its size, which makes the limit useless against exactly the
response it protects against. An oversized response costs the ceiling, not the
body.

A declared `Content-Length` over the ceiling is refused before a single byte is
read (`response_too_large`). The streaming reader still bounds bodies that lie or
send no length at all.

`TextDecoder('utf-8', { fatal: false })` so a page in an unexpected encoding
yields replacement characters rather than throwing — a mis-encoded page is still
worth extracting signals from.

Error-page bodies and wrong-content-type bodies are cancelled rather than read.

### Link extraction uses a regex, not a DOM

Workers has `HTMLRewriter`, but it is a streaming transformer rather than a
queryable DOM, and there is no `DOMParser` in the runtime at all — so a full
parser would mean bundling one. For the narrow job of "find href values", a
regex over the raw HTML is sufficient and testable in plain Node, which is what
the test suite runs in. The scan is bounded to 500 matches on untrusted input.

## Crawl outcomes

`crawlSite` returns `status` of `completed`, `failed` or `skipped`.

- **Homepage failure is crawl failure.** A site whose homepage does not answer
  has nothing for the engine to read. A *secondary* page failing is just one
  fewer page.
- **Zero pages fetched with no other error** → `failed` / `no_pages_fetched`.
- `skipped` (robots, unparseable website) → the lead goes to `NOT_QUALIFIED`.
- `failed` → the lead goes to `HOLD`, which is actionable rather than terminal.

Every per-page outcome is recorded in `pages_json` with its reason:
`robots_disallowed`, `budget_exhausted`, `http_404`, `content_type:application/pdf`,
`timeout`, `network_error:<name>`, `offsite_redirect`, `response_too_large`, and
the SSRF reasons above.

## Budget integration

The page budget reaches the crawl loop through an injected `onBudget` callback,
so `crawlSite` never has to know about D1. It is called **before each page
fetch** — checking after would let a run overshoot by its concurrency.
`services/research.js` supplies it, calling `consumeBudget(db, 'crawl_pages')`.

Pages reserved but never fetched are **released**: a robots.txt refusal should not
consume the day's budget.

Daily default: `USAGE_LIMITS.crawl_pages` = 800.

## Browser Run — three conditions

`src/lead-engine/crawler/browserRun.js`.

`shouldUseBrowserRun(crawlResult)` returns `{ eligible, reason }` so a skipped
fallback is explainable on the lead detail screen rather than an invisible
non-event. All three must hold:

| # | Condition | Ineligible reason if not |
|---|---|---|
| 1 | robots.txt did not disallow | `robots_disallowed` |
| 2 | The page looks client-rendered | `server_rendered_content_available` |
| 3 | The crawl was not skipped | `crawl_skipped` |

Condition 1 is the important one: **this is the same page, fetched differently —
not a way around a refusal.**

Condition 2 is measured by `looksClientRendered`: strip `script`, `style`,
`noscript` and tags, collapse whitespace, and check whether fewer than 400
characters of visible text remain. A client-rendered app typically serves a large
HTML document containing almost no words.

Beyond the three conditions, `services/research.js` additionally requires:

- `LEAD_BROWSER_RUN_ENABLED` (and therefore `LEAD_ENGINE_ENABLED`) to be on;
- `isBrowserRunConfigured(env)` — both `CLOUDFLARE_ACCOUNT_ID` and
  `BROWSER_RENDERING_API_TOKEN` present;
- a unit of the daily `browser_runs` budget (20/day), released if the render
  fails.

### Implementation notes

It calls the Cloudflare **Browser Rendering REST `/content` endpoint**, not the
Workers binding. The binding requires `@cloudflare/puppeteer`, a substantial
dependency to add to a Worker that serves the public site, for a path that runs
on a small minority of leads. With the account id and token absent the module is
completely inert — which is the state it ships in.

The request sets `waitUntil: 'networkidle0'`, a 20-second goto timeout inside a
30-second outer abort, rejects `image`/`media`/`font` resource types, and passes
`CRAWLER.userAgent`. The **same SSRF check** runs first — a different fetch
mechanism is not a reason to skip it; if anything a headless browser is a more
capable request engine to have pointed at an internal address.

On success the rendered homepage **replaces** the crawled page set, the crawl
method is recorded as `browser`, and a `BROWSER_RUN_USED` activity row is written.
Failure reasons: `browser_run_not_configured`, `browser_render_http_<status>`,
`browser_render_empty`, `browser_render_timeout`, `browser_render_error:<name>`.
