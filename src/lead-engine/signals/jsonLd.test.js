import { describe, expect, it } from 'vitest'
import { CRAWLER } from '../config/defaults.js'
import { parseJsonLd } from './html.js'
import { extractSignals } from './extract.js'

/**
 * The block this engine most needs to read is the one it used to skip.
 *
 * `parseJsonLd` capped a block's content at 20,000 characters inside the regex
 * itself. A larger block was not truncated — the lazy quantifier never reached
 * `</script>`, so the pattern did not match and the whole block vanished with
 * no error, no log, and nothing to notice.
 *
 * Found on a real lead. A Houston law firm published its email, telephone and
 * postal address in a `LocalBusiness` block that also carried 104 reviews,
 * running to 101,563 characters. The crawler fetched the page, marked it used,
 * and extracted signals from it; the CRM showed no email. A second, tiny
 * `WebSite` block parsed cleanly, so structured data looked like it was
 * working. Review markup is routine for exactly the local businesses these
 * campaigns target, so this was not a rare shape.
 */

/** A LocalBusiness block padded past the old cap the way review markup pads it. */
function bigLocalBusinessBlock(email, padToChars) {
  const reviews = []
  let block = ''

  // Grown until the serialized block passes the requested size, rather than
  // guessed at, so the fixture stays honest if the shape changes.
  for (let index = 0; block.length < padToChars; index += 1) {
    reviews.push({
      '@type': 'Review',
      author: { '@type': 'Person', name: `Reviewer ${index}` },
      reviewRating: { '@type': 'Rating', ratingValue: '5' },
      reviewBody: 'Excellent representation from start to finish, highly recommended to anyone.',
    })
    block = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'The Example Firm',
      telephone: '346-421-3866',
      email,
      address: { '@type': 'PostalAddress', streetAddress: '1207 S Shepherd Drive', addressLocality: 'Houston' },
      review: reviews,
    })
  }

  return block
}

const SMALL_WEBSITE_BLOCK = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  url: 'https://example.com/',
})

const page = (blocks) =>
  `<html><head>${blocks
    .map((block) => `<script type="application/ld+json">${block}</script>`)
    .join('')}</head><body><h1>The Example Firm</h1></body></html>`

describe('parseJsonLd', () => {
  it('reads a block far larger than the old 20,000 character cap', () => {
    const big = bigLocalBusinessBlock('hello@example.com', 60_000)
    expect(big.length).toBeGreaterThan(20_000)

    const entities = parseJsonLd(page([big]))

    expect(entities).toHaveLength(1)
    expect(entities[0].email).toBe('hello@example.com')
  })

  it('does not let one oversized block hide the others, or the reverse', () => {
    // The real page had both. Only the small one survived, which is what made
    // structured data look healthy while the contact details were lost.
    const entities = parseJsonLd(page([bigLocalBusinessBlock('hello@example.com', 60_000), SMALL_WEBSITE_BLOCK]))

    expect(entities.map((entity) => entity['@type'])).toEqual(['LocalBusiness', 'WebSite'])
  })

  it('reads a block at the crawler page limit, because the crawler would deliver it', () => {
    // The bound is CRAWLER.maxResponseBytes precisely so that anything the
    // crawler is willing to fetch, this is willing to read. If the two ever
    // drift apart, pages come back readable and silently unparsed again.
    const big = bigLocalBusinessBlock('hello@example.com', Math.min(400_000, CRAWLER.maxResponseBytes - 1_000))

    expect(parseJsonLd(page([big]))[0]?.email).toBe('hello@example.com')
  })

  it('still skips a malformed block without failing the page', () => {
    const entities = parseJsonLd(page(['{ "@type": "LocalBusiness", }', SMALL_WEBSITE_BLOCK]))

    expect(entities.map((entity) => entity['@type'])).toEqual(['WebSite'])
  })
})

describe('extractSignals, through the structured-data path', () => {
  it('extracts the email a large LocalBusiness block publishes', () => {
    // The end-to-end shape of the original failure: a page that crawls fine,
    // yields signals, and produced no contact.
    const html = page([bigLocalBusinessBlock('lefflerlaw@gmail.com', 60_000), SMALL_WEBSITE_BLOCK])

    const result = extractSignals({
      pages: [{ url: 'https://example.com/', html, used: true }],
      websiteUrl: 'https://example.com/',
      company: { name: 'The Example Firm' },
    })

    expect(result.emails).toHaveLength(1)
    expect(result.emails[0].email).toBe('lefflerlaw@gmail.com')
    // Provenance is the point of taking it from structured data rather than
    // guessing: an address with no source is not one this engine will use.
    expect(result.emails[0].sourceType).toBe('structured_data')
    expect(result.emails[0].sourceUrl).toBe('https://example.com/')
  })

  it('takes the telephone from the same block', () => {
    const html = page([bigLocalBusinessBlock('hello@example.com', 60_000)])

    const result = extractSignals({
      pages: [{ url: 'https://example.com/', html, used: true }],
      websiteUrl: 'https://example.com/',
      company: { name: 'The Example Firm' },
    })

    expect(result.phones.some((phone) => phone.includes('346'))).toBe(true)
  })
})
