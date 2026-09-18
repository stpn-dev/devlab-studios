import { describe, expect, it, vi } from 'vitest'
import { crawlSite, extractLinks, looksClientRendered, scoreLink } from './crawlSite.js'

const noSleep = async () => {}

function site(pages, { robots = 'User-agent: *\nDisallow:\n' } = {}) {
  return async (url) => {
    if (url.endsWith('/robots.txt')) {
      return new Response(robots, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    const key = Object.keys(pages).find((candidate) => url === candidate || url === `${candidate}/`)
    if (!key) return new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })
    return new Response(pages[key], { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
}

describe('extractLinks', () => {
  it('finds same-site links and their text', () => {
    const html = `
      <a href="/contact">Get in touch</a>
      <a href="https://www.example.com/about">About us</a>
      <a href="https://other.com/x">Off site</a>
      <a href="mailto:hi@example.com">Email</a>
      <a href="#section">Anchor</a>
    `
    const links = extractLinks(html, 'https://example.com/')

    expect(links.map((link) => link.url)).toEqual([
      'https://example.com/contact',
      'https://www.example.com/about',
    ])
    expect(links[0].text).toBe('Get in touch')
  })

  it('deduplicates links that canonicalize to the same URL', () => {
    const html = '<a href="/contact">a</a><a href="/contact/">b</a><a href="/contact#form">c</a>'
    expect(extractLinks(html, 'https://example.com/')).toHaveLength(1)
  })
})

describe('scoreLink', () => {
  it('prefers the homepage, then contact, then services', () => {
    const contact = scoreLink({ url: 'https://example.com/contact', text: '' })
    const services = scoreLink({ url: 'https://example.com/services', text: '' })
    const about = scoreLink({ url: 'https://example.com/about', text: '' })
    expect(contact).toBeLessThan(services)
    expect(services).toBeLessThan(about)
  })

  it('falls back to link text for non-standard paths', () => {
    const score = scoreLink({ url: 'https://example.com/get-in-touch', text: 'Contact our office' })
    expect(Number.isFinite(score)).toBe(true)
  })

  it('ignores links that are worth no budget', () => {
    expect(scoreLink({ url: 'https://example.com/blog/post-17', text: 'Read more' })).toBe(Infinity)
  })

  it('ranks an explicit path above a text match', () => {
    const path = scoreLink({ url: 'https://example.com/contact', text: '' })
    const text = scoreLink({ url: 'https://example.com/reach', text: 'Contact' })
    expect(path).toBeLessThan(text)
  })
})

describe('looksClientRendered', () => {
  it('detects an empty shell', () => {
    expect(looksClientRendered('<html><body><div id="root"></div><script src="app.js"></script></body></html>')).toBe(true)
  })

  it('does not flag a page with real content', () => {
    expect(looksClientRendered(`<html><body><p>${'Property management services in Austin. '.repeat(20)}</p></body></html>`)).toBe(false)
  })

  it('does not count script contents as text', () => {
    const html = `<html><body><div id="root"></div><script>${'x'.repeat(5000)}</script></body></html>`
    expect(looksClientRendered(html)).toBe(true)
  })
})

describe('crawlSite', () => {
  it('crawls the homepage and the highest-priority discovered pages', async () => {
    const fetchImpl = site({
      'https://example.com/': '<html><body><a href="/contact">Contact</a><a href="/about">About</a><a href="/services">Services</a>Words words words</body></html>',
      'https://example.com/contact': '<html><body>Contact page</body></html>',
      'https://example.com/services': '<html><body>Services page</body></html>',
      'https://example.com/about': '<html><body>About page</body></html>',
    })

    const result = await crawlSite('https://example.com', { fetchImpl, sleepImpl: noSleep })

    expect(result.status).toBe('completed')
    expect(result.pagesFetched).toBe(4)
    const fetched = result.pages.filter((page) => page.used).map((page) => page.url)
    expect(fetched).toContain('https://example.com/contact')
    expect(fetched).toContain('https://example.com/services')
  })

  it('never exceeds the page budget', async () => {
    const many = Array.from({ length: 40 }, (_, index) => `<a href="/contact-${index}">Contact ${index}</a>`).join('')
    const pages = { 'https://example.com/': `<html><body>${many} words words</body></html>` }
    for (let index = 0; index < 40; index += 1) {
      pages[`https://example.com/contact-${index}`] = '<html><body>page</body></html>'
    }

    const result = await crawlSite('https://example.com', { fetchImpl: site(pages), sleepImpl: noSleep })
    expect(result.pagesFetched).toBeLessThanOrEqual(4)
  })

  it('skips the whole site when robots.txt disallows the root', async () => {
    const fetchImpl = vi.fn(
      site({ 'https://example.com/': '<html>hi</html>' }, { robots: 'User-agent: *\nDisallow: /\n' }),
    )

    const result = await crawlSite('https://example.com', { fetchImpl, sleepImpl: noSleep })

    expect(result.status).toBe('skipped')
    expect(result.skipReason).toContain('robots_disallowed')
    expect(result.robotsAllowed).toBe(false)
    // robots.txt only — no page was requested.
    expect(fetchImpl.mock.calls).toHaveLength(1)
  })

  it('skips an individual disallowed path but continues the crawl', async () => {
    const fetchImpl = site(
      {
        'https://example.com/': '<html><body><a href="/contact">Contact</a><a href="/about">About</a> words words</body></html>',
        'https://example.com/about': '<html><body>About</body></html>',
      },
      { robots: 'User-agent: *\nDisallow: /contact\n' },
    )

    const result = await crawlSite('https://example.com', { fetchImpl, sleepImpl: noSleep })

    expect(result.status).toBe('completed')
    const contact = result.pages.find((page) => page.url === 'https://example.com/contact')
    expect(contact.used).toBe(false)
    expect(contact.reason).toBe('robots_disallowed')
    expect(result.pages.some((page) => page.url === 'https://example.com/about' && page.used)).toBe(true)
  })

  it('fails the crawl when the homepage is unreachable', async () => {
    const result = await crawlSite('https://example.com', {
      fetchImpl: async (url) =>
        url.endsWith('/robots.txt')
          ? new Response('', { status: 404 })
          : new Response('', { status: 500, headers: { 'content-type': 'text/html' } }),
      sleepImpl: noSleep,
    })

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toBe('http_500')
  })

  it('tolerates a secondary page failing', async () => {
    const result = await crawlSite('https://example.com', {
      fetchImpl: async (url) => {
        if (url.endsWith('/robots.txt')) return new Response('', { status: 404 })
        if (url === 'https://example.com/') {
          return new Response('<html><body><a href="/contact">Contact</a> words words words</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        }
        return new Response('', { status: 503, headers: { 'content-type': 'text/html' } })
      },
      sleepImpl: noSleep,
    })

    expect(result.status).toBe('completed')
    expect(result.pagesFetched).toBe(1)
  })

  it('stops when the budget callback refuses', async () => {
    let allowed = 2
    const result = await crawlSite('https://example.com', {
      fetchImpl: site({
        'https://example.com/': '<html><body><a href="/contact">Contact</a><a href="/about">About</a> words words</body></html>',
        'https://example.com/contact': '<html>contact</html>',
        'https://example.com/about': '<html>about</html>',
      }),
      sleepImpl: noSleep,
      onBudget: async () => {
        allowed -= 1
        return allowed >= 0
      },
    })

    expect(result.pagesFetched).toBe(2)
    expect(result.pages.some((page) => page.reason === 'budget_exhausted')).toBe(true)
  })

  it('reports a client-rendered homepage so Browser Run can be considered', async () => {
    const result = await crawlSite('https://example.com', {
      fetchImpl: site({ 'https://example.com/': '<html><body><div id="app"></div></body></html>' }),
      sleepImpl: noSleep,
    })

    expect(result.clientRendered).toBe(true)
  })

  it('refuses an unparseable website without touching the network', async () => {
    const fetchImpl = vi.fn()
    const result = await crawlSite('not a url', { fetchImpl, sleepImpl: noSleep })

    expect(result.status).toBe('skipped')
    expect(result.skipReason).toBe('unparseable_website')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('honours a site Crawl-delay above our floor', async () => {
    const slept = []
    await crawlSite('https://example.com', {
      fetchImpl: site(
        {
          'https://example.com/': '<html><body><a href="/contact">Contact</a> words words</body></html>',
          'https://example.com/contact': '<html>contact</html>',
        },
        { robots: 'User-agent: *\nCrawl-delay: 3\n' },
      ),
      sleepImpl: async (ms) => {
        slept.push(ms)
      },
    })

    expect(slept.every((ms) => ms >= 3000)).toBe(true)
  })
})
