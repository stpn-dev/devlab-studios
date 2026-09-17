import { describe, expect, it } from 'vitest'
import { parseFeed } from './fetchFeed.js'
import { MAX_ITEMS_PER_FEED } from './feeds.js'

const FEED = { name: 'Test Feed', url: 'https://example.com/rss' }

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <item>
      <title><![CDATA[Model shipping & scaling]]></title>
      <link>https://example.com/a</link>
      <description>&lt;p&gt;Some &lt;b&gt;HTML&lt;/b&gt; body text.&lt;/p&gt;</description>
      <pubDate>Tue, 16 Sep 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.com/b</link>
      <description>Plain text</description>
      <pubDate>Mon, 15 Sep 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom entry</title>
    <link rel="alternate" href="https://example.org/atom-1"/>
    <summary>Atom summary text</summary>
    <published>2026-09-16T08:30:00Z</published>
  </entry>
</feed>`

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>Old school</title></channel>
  <item>
    <title>RDF item</title>
    <link>https://example.net/rdf-1</link>
    <description>RDF description</description>
    <dc:date>2026-09-14T00:00:00Z</dc:date>
  </item>
</rdf:RDF>`

describe('parseFeed', () => {
  it('reads RSS items, decoding CDATA and entities and stripping markup from the excerpt', () => {
    const items = parseFeed(RSS, FEED)

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      sourceName: 'Test Feed',
      sourceUrl: 'https://example.com/a',
      title: 'Model shipping & scaling',
      excerpt: 'Some HTML body text.',
    })
    expect(items[0].publishedAt).toBe('2026-09-16T10:00:00.000Z')
  })

  it('reads Atom entries, taking the URL from the alternate link', () => {
    const items = parseFeed(ATOM, FEED)

    expect(items).toHaveLength(1)
    expect(items[0].sourceUrl).toBe('https://example.org/atom-1')
    expect(items[0].publishedAt).toBe('2026-09-16T08:30:00.000Z')
  })

  it('reads RDF (RSS 1.0) items, where items are siblings of the channel', () => {
    const items = parseFeed(RDF, FEED)

    expect(items).toHaveLength(1)
    expect(items[0].sourceUrl).toBe('https://example.net/rdf-1')
  })

  it('drops items with no title, no link, or a non-http scheme', () => {
    const xml = `<rss><channel>
      <item><title>No link</title></item>
      <item><link>https://example.com/no-title</link></item>
      <item><title>Bad scheme</title><link>javascript:alert(1)</link></item>
      <item><title>Good</title><link>https://example.com/good</link></item>
    </channel></rss>`

    const items = parseFeed(xml, FEED)

    expect(items).toHaveLength(1)
    expect(items[0].sourceUrl).toBe('https://example.com/good')
  })

  it('caps how much one feed can contribute', () => {
    const entries = Array.from(
      { length: MAX_ITEMS_PER_FEED + 5 },
      (_, index) => `<item><title>Item ${index}</title><link>https://example.com/${index}</link></item>`,
    ).join('')

    expect(parseFeed(`<rss><channel>${entries}</channel></rss>`, FEED)).toHaveLength(MAX_ITEMS_PER_FEED)
  })

  it('returns nothing rather than throwing when the response is not a feed', () => {
    expect(parseFeed('<html><body>Not a feed</body></html>', FEED)).toEqual([])
    expect(parseFeed('', FEED)).toEqual([])
  })

  it('handles a single-item feed, which parses as an object rather than an array', () => {
    const xml = '<rss><channel><item><title>Only one</title><link>https://example.com/one</link></item></channel></rss>'
    expect(parseFeed(xml, FEED)).toHaveLength(1)
  })
})
