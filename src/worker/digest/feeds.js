/**
 * The feed registry.
 *
 * Server-owned, exactly like src/config/offers.js. The scheduled run only ever
 * fetches URLs from this list — never one from a request, a CMS field, or a
 * feed's own contents. That is what stops the digest becoming an open proxy or
 * an SSRF surface, and it is why each feed can be validated once when it is
 * added here rather than defended against generically at parse time.
 *
 * Scope is AI automation and AI advancement, which is what the digest claims
 * to cover. Adding a feed means checking it actually publishes on that topic.
 */
export const DIGEST_FEEDS = [
  {
    name: 'Cloudflare Blog',
    url: 'https://blog.cloudflare.com/rss/',
    homepage: 'https://blog.cloudflare.com/',
  },
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    homepage: 'https://techcrunch.com/category/artificial-intelligence/',
  },
  {
    name: 'Ars Technica AI',
    url: 'https://arstechnica.com/ai/feed/',
    homepage: 'https://arstechnica.com/ai/',
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog/feed.xml',
    homepage: 'https://huggingface.co/blog',
  },
]

/** Most items to publish in one day's digest. */
export const MAX_ITEMS_PER_DIGEST = 10
/** Most items taken from any single feed, so one busy source cannot fill the day. */
export const MAX_ITEMS_PER_FEED = 4
/** How many days of digests are kept before the retention sweep removes them. */
export const RETENTION_DAYS = 7
/**
 * Items older than this are ignored. A feed that goes quiet should shrink the
 * digest, not pad it with last month's news presented as today's.
 */
export const MAX_ITEM_AGE_DAYS = 7
