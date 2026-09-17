import { XMLParser } from 'fast-xml-parser'
import { MAX_ITEMS_PER_FEED } from './feeds.js'

/**
 * Fetching and normalizing one RSS/Atom feed.
 *
 * Every outbound call is bounded and every failure is contained: a feed that
 * times out, returns garbage, or 500s must cost the run that one source, never
 * the whole digest.
 */

const FEED_TIMEOUT_MS = 8000
/**
 * Feeds list newest first, so truncating only discards items we were never
 * going to use. The cap exists so a malformed or hostile response cannot make
 * the parser chew through megabytes.
 */
const MAX_FEED_BYTES = 256 * 1024

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Feeds routinely wrap titles in CDATA and encode entities; letting the
  // parser handle both is the whole reason for taking the dependency.
  processEntities: true,
  trimValues: true,
})

/** Feed values arrive as strings, numbers, or `{ '#text': … }`. Flatten them. */
function text(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return text(value['#text'])
  return ''
}

/** Atom puts the URL on `<link href>`; RSS puts it in the element body. */
function linkOf(entry) {
  const link = entry.link
  if (typeof link === 'string') return link.trim()
  if (Array.isArray(link)) {
    const alternate = link.find((candidate) => !candidate?.['@_rel'] || candidate['@_rel'] === 'alternate')
    return String(alternate?.['@_href'] || alternate || '').trim()
  }
  if (link && typeof link === 'object') return String(link['@_href'] || text(link)).trim()
  return ''
}

function firstDate(entry) {
  for (const key of ['pubDate', 'published', 'updated', 'dc:date']) {
    const value = text(entry[key])
    if (!value) continue
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return null
}

/**
 * A short plain-text excerpt, used ONLY as input to the summarizer and never
 * stored or rendered. Markup is stripped and the result hard-capped, so the
 * model receives a sentence or two of context rather than a whole article.
 */
function excerptOf(entry) {
  const raw = text(entry.description) || text(entry.summary) || text(entry.content) || text(entry['content:encoded'])
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function entriesOf(parsed) {
  const rssItems = parsed?.rss?.channel?.item
  if (rssItems) return Array.isArray(rssItems) ? rssItems : [rssItems]

  const atomEntries = parsed?.feed?.entry
  if (atomEntries) return Array.isArray(atomEntries) ? atomEntries : [atomEntries]

  // RDF (RSS 1.0) keeps items as a sibling of <channel>.
  const rdfItems = parsed?.['rdf:RDF']?.item
  if (rdfItems) return Array.isArray(rdfItems) ? rdfItems : [rdfItems]

  return []
}

/** Parses feed XML into normalized items. Exported so tests can use fixtures. */
export function parseFeed(xml, feed) {
  let parsed
  try {
    parsed = parser.parse(xml)
  } catch {
    return []
  }

  return entriesOf(parsed)
    .map((entry) => ({
      sourceName: feed.name,
      sourceUrl: linkOf(entry),
      title: text(entry.title),
      excerpt: excerptOf(entry),
      publishedAt: firstDate(entry),
    }))
    // An item with no title or no link is not something we can attribute or
    // send a reader to, so it is dropped rather than rendered half-formed.
    .filter((item) => item.title && /^https?:\/\//i.test(item.sourceUrl))
    .slice(0, MAX_ITEMS_PER_FEED)
}

/**
 * Fetches and parses one feed. Never throws: a failure returns an empty list
 * so the caller's loop continues to the next source.
 */
export async function fetchFeedItems(feed) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)

  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'DevLabStudios-Digest/1.0 (+https://www.devlabstudios.com)' },
    })

    if (!response.ok) {
      console.log(JSON.stringify({ event: 'digest_feed', outcome: 'http_error', feed: feed.name, status: response.status }))
      return []
    }

    const xml = (await response.text()).slice(0, MAX_FEED_BYTES)
    const items = parseFeed(xml, feed)
    console.log(JSON.stringify({ event: 'digest_feed', outcome: 'ok', feed: feed.name, items: items.length }))
    return items
  } catch (error) {
    console.log(
      JSON.stringify({
        event: 'digest_feed',
        outcome: 'fetch_failed',
        feed: feed.name,
        error: error instanceof Error ? error.message : 'unknown',
      }),
    )
    return []
  } finally {
    clearTimeout(timeout)
  }
}
