import { describe, expect, it } from 'vitest'
import { assertSafeUrl, checkRedirect, checkUrlSafety, UnsafeUrlError } from './ssrf.js'
import { isSameSite } from '../domain/domains.js'

describe('checkUrlSafety', () => {
  it('allows an ordinary public website', () => {
    expect(checkUrlSafety('https://example.com/contact').safe).toBe(true)
    expect(checkUrlSafety('http://www.example.com/').safe).toBe(true)
    expect(checkUrlSafety('https://example.com:8443/x').safe).toBe(true)
  })

  it('blocks loopback and localhost in every spelling', () => {
    for (const url of [
      'http://localhost/',
      'http://localhost:8787/api/admin/leads',
      'http://127.0.0.1/',
      'http://127.1.2.3/',
      'http://[::1]/',
      'http://app.localhost/',
      'http://printer.local/',
      'http://service.internal/',
    ]) {
      expect(checkUrlSafety(url).safe, url).toBe(false)
    }
  })

  it('blocks the cloud metadata endpoint specifically', () => {
    const result = checkUrlSafety('http://169.254.169.254/latest/meta-data/')
    expect(result.safe).toBe(false)
    expect(result.reason).toBe('cloud_metadata_endpoint')

    expect(checkUrlSafety('http://metadata.google.internal/').safe).toBe(false)
  })

  it('blocks every private IPv4 range', () => {
    for (const url of [
      'http://10.0.0.1/',
      'http://172.16.0.1/',
      'http://172.31.255.254/',
      'http://192.168.1.1/',
      'http://169.254.10.10/',
      'http://100.64.0.1/',
      'http://0.0.0.0/',
      'http://255.255.255.255/',
    ]) {
      expect(checkUrlSafety(url).safe, url).toBe(false)
    }
  })

  it('does not treat 172.15 or 172.32 as private, which would over-block', () => {
    // These sit just outside RFC1918's 172.16.0.0/12 and are ordinary public
    // space — but they are still IP literals, so they are refused for that
    // reason rather than as private addresses.
    expect(checkUrlSafety('http://172.15.0.1/').reason).toBe('ip_literal')
    expect(checkUrlSafety('http://172.32.0.1/').reason).toBe('ip_literal')
  })

  it('blocks IPv4-mapped IPv6, the standard way past an IPv4-only check', () => {
    expect(checkUrlSafety('http://[::ffff:127.0.0.1]/').safe).toBe(false)
    expect(checkUrlSafety('http://[::ffff:10.0.0.1]/').safe).toBe(false)
  })

  it('blocks unique-local and link-local IPv6', () => {
    expect(checkUrlSafety('http://[fd00::1]/').safe).toBe(false)
    expect(checkUrlSafety('http://[fe80::1]/').safe).toBe(false)
  })

  it('blocks non-http schemes', () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'data:text/html,x']) {
      expect(checkUrlSafety(url).safe, url).toBe(false)
    }
  })

  it('blocks embedded credentials, which would be sent to the remote host', () => {
    expect(checkUrlSafety('https://admin:secret@example.com/').reason).toBe('embedded_credentials')
  })

  it('blocks internal service ports', () => {
    expect(checkUrlSafety('http://example.com:6379/').reason).toBe('blocked_port:6379')
    expect(checkUrlSafety('http://example.com:22/').reason).toBe('blocked_port:22')
  })

  it('blocks hostnames that cannot be public domains', () => {
    expect(checkUrlSafety('http://intranet/').safe).toBe(false)
    expect(checkUrlSafety('http://example.onion/').safe).toBe(false)
  })

  it('rejects garbage rather than throwing', () => {
    expect(checkUrlSafety('not a url').safe).toBe(false)
    expect(checkUrlSafety('').safe).toBe(false)
    expect(checkUrlSafety(null).safe).toBe(false)
  })
})

describe('assertSafeUrl', () => {
  it('returns the parsed URL for a safe target', () => {
    expect(assertSafeUrl('https://example.com/x').hostname).toBe('example.com')
  })

  it('throws UnsafeUrlError carrying the reason', () => {
    expect(() => assertSafeUrl('http://127.0.0.1/')).toThrow(UnsafeUrlError)
    try {
      assertSafeUrl('http://169.254.169.254/')
    } catch (error) {
      expect(error.reason).toBe('cloud_metadata_endpoint')
    }
  })
})

describe('checkRedirect', () => {
  it('follows a same-site redirect', () => {
    expect(checkRedirect('https://example.com/', 'https://www.example.com/contact', isSameSite).allowed).toBe(true)
  })

  it('refuses a redirect to a private address, which is the real attack', () => {
    const result = checkRedirect('https://example.com/', 'http://169.254.169.254/', isSameSite)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('unsafe_redirect')
  })

  it('refuses an off-site redirect, so the page budget stays with the site we targeted', () => {
    const result = checkRedirect('https://example.com/', 'https://other.com/', isSameSite)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('offsite_redirect')
  })
})
