import { describe, expect, it, vi } from 'vitest'
import { fetchPage } from './fetchPage.js'

function htmlResponse(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  })
}

function redirect(location, status = 302) {
  return new Response('', { status, headers: { location } })
}

describe('fetchPage', () => {
  it('fetches an ordinary HTML page', async () => {
    const result = await fetchPage('https://example.com/contact', {
      fetchImpl: async () => htmlResponse('<html><body>Hi</body></html>'),
    })

    expect(result.ok).toBe(true)
    expect(result.html).toContain('Hi')
    expect(result.status).toBe(200)
    expect(result.finalUrl).toBe('https://example.com/contact')
  })

  it('sends the transparent DevLab user agent', async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('<html></html>'))
    await fetchPage('https://example.com/', { fetchImpl })

    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers['User-Agent']).toContain('DevLabResearchBot')
    expect(init.headers['User-Agent']).toContain('devlabstudios.com/crawler')
  })

  it('refuses an unsafe target before making any request', async () => {
    const fetchImpl = vi.fn()
    const result = await fetchPage('http://169.254.169.254/latest/meta-data/', { fetchImpl })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('cloud_metadata_endpoint')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('follows a same-site redirect and reports the final URL', async () => {
    const fetchImpl = vi.fn(async (url) =>
      url === 'https://example.com/contact'
        ? redirect('https://www.example.com/contact-us')
        : htmlResponse('<html>contact</html>'),
    )

    const result = await fetchPage('https://example.com/contact', { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.redirects).toBe(1)
    expect(result.finalUrl).toBe('https://www.example.com/contact-us')
  })

  it('refuses a redirect into private address space', async () => {
    const result = await fetchPage('https://example.com/', {
      fetchImpl: async () => redirect('http://127.0.0.1:8787/api/admin/leads'),
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('unsafe_redirect')
  })

  it('refuses an off-site redirect', async () => {
    const result = await fetchPage('https://example.com/', {
      fetchImpl: async () => redirect('https://attacker.com/'),
    })
    expect(result.reason).toBe('offsite_redirect')
  })

  it('stops after the redirect limit rather than looping forever', async () => {
    let hop = 0
    const result = await fetchPage('https://example.com/a', {
      fetchImpl: async () => {
        hop += 1
        return redirect(`https://example.com/hop-${hop}`)
      },
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('too_many_redirects')
    expect(hop).toBe(4) // the initial request plus maxRedirects (3)
  })

  it('rejects a non-HTML content type without reading the body', async () => {
    const result = await fetchPage('https://example.com/brochure.pdf', {
      fetchImpl: async () => new Response('%PDF-1.4', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('content_type:application/pdf')
    expect(result.html).toBe('')
  })

  it('refuses a declared content-length over the ceiling', async () => {
    const result = await fetchPage('https://example.com/', {
      fetchImpl: async () =>
        htmlResponse('<html></html>', { 'content-length': String(50_000_000) }),
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('response_too_large')
  })

  it('truncates a body that exceeds the ceiling without a declared length', async () => {
    const oversized = 'a'.repeat(5_000)
    const result = await fetchPage('https://example.com/', {
      limits: { maxResponseBytes: 1_000 },
      fetchImpl: async () => htmlResponse(oversized),
    })

    expect(result.truncated).toBe(true)
    expect(result.bytes).toBeGreaterThan(1_000)
    // The point of the bound: we did not retain the whole oversized body.
    expect(result.html.length).toBeLessThan(oversized.length)
  })

  it('reports an HTTP error rather than throwing', async () => {
    const result = await fetchPage('https://example.com/missing', {
      fetchImpl: async () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } }),
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('http_404')
    expect(result.status).toBe(404)
  })

  it('reports a network failure rather than throwing', async () => {
    const result = await fetchPage('https://example.com/', {
      fetchImpl: async () => {
        throw new TypeError('connection refused')
      },
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('network_error')
  })

  it('reports a timeout when the request exceeds its budget', async () => {
    const result = await fetchPage('https://example.com/', {
      limits: { requestTimeoutMs: 10 },
      fetchImpl: (url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('timeout')
  })

  it('handles a redirect with no Location header', async () => {
    const result = await fetchPage('https://example.com/', {
      fetchImpl: async () => new Response('', { status: 301 }),
    })
    expect(result.reason).toBe('redirect_without_location')
  })
})
