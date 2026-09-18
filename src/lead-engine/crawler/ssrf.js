/**
 * SSRF protection for the research crawler.
 *
 * The crawler fetches URLs that came from OUTSIDE this system — a directory
 * listing, a search result, a CSV an operator pasted in, a redirect a remote
 * server chose. Any of those can point at `http://127.0.0.1:8787/api/admin/...`
 * or at a cloud metadata endpoint, and the Worker would fetch it with whatever
 * network position it has. Every URL the crawler is about to request passes
 * through `assertSafeUrl` first, including every redirect target — the redirect
 * is the case people forget, and it is the easier one to exploit because the
 * attacker controls it at request time rather than at discovery time.
 *
 * DNS rebinding is NOT fully solved here and cannot be from inside a Worker:
 * there is no API to resolve a hostname and then connect to that resolved
 * address, so a hostname that resolves to a public address at check time and a
 * private one at connect time would slip through. What mitigates it in practice
 * is that Cloudflare Workers' `fetch` does not route to RFC1918 space from the
 * edge at all. The literal checks below are what protect local `wrangler dev`
 * and any future non-Worker runtime, and they are cheap enough to keep
 * regardless. See docs/lead-engine/crawler.md.
 */

/** Only these two schemes are ever fetched. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Hostnames that are never a public business website, matched exactly or as a
 * suffix for the `.local`-style TLDs.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  // AWS/GCP/Azure/DigitalOcean/Oracle instance metadata, and Alibaba's.
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
])

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.onion']

/**
 * The single well-known link-local metadata address, called out separately from
 * the 169.254/16 range only so the refusal message is specific.
 */
const METADATA_IPV4 = '169.254.169.254'

/** Ports that are never a public website and are frequently internal services. */
const BLOCKED_PORTS = new Set([
  22, 23, 25, 110, 143, 445, 993, 995, 1433, 1521, 2049, 3306, 3389,
  5432, 5984, 6379, 8020, 9042, 9200, 11211, 27017,
])

/**
 * @param {string} hostname
 * @returns {number[]|null} the four octets, or null when it is not an IPv4 literal
 */
function parseIpv4(hostname) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return null

  const octets = match.slice(1, 5).map(Number)
  // Reject values that are not canonical octets — `1.2.3.999` parses as a
  // hostname elsewhere but must not be treated as a safe IP here.
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
  return octets
}

/**
 * Whether an IPv4 literal is in a range that is never a public website.
 *
 * @param {number[]} octets
 */
function isPrivateIpv4([a, b]) {
  if (a === 0) return true // "this network"
  if (a === 10) return true // RFC1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 192 && b === 0) return true // IETF protocol assignments / 192.0.2.0 TEST-NET
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a >= 224) return true // multicast and reserved, incl. 255.255.255.255
  return false
}

/**
 * Whether an IPv6 literal is in a range that is never a public website.
 *
 * Normalizes the bracketed form and handles the IPv4-mapped notation
 * (`::ffff:127.0.0.1`), which is the standard way to smuggle a loopback
 * address past a naive IPv4-only check.
 *
 * @param {string} hostname
 */
function isBlockedIpv6(hostname) {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!address.includes(':')) return false

  if (address === '::' || address === '::1') return true

  const mapped = address.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) {
    const octets = parseIpv4(mapped[1])
    return !octets || isPrivateIpv4(octets)
  }

  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast.
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true
  if (/^ff[0-9a-f]{2}:/.test(address)) return true

  return false
}

export class UnsafeUrlError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason)
    this.name = 'UnsafeUrlError'
    this.reason = reason
  }
}

/**
 * Whether a URL is safe for the crawler to request.
 *
 * Returns a result rather than throwing, because "this URL is not safe" is an
 * ordinary crawl outcome that gets recorded as a skip reason, not an exception.
 * `assertSafeUrl` below is the throwing variant for call sites that want it.
 *
 * @param {unknown} value
 * @returns {{ safe: boolean, reason?: string, url?: URL }}
 */
export function checkUrlSafety(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    return { safe: false, reason: 'not_a_url' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { safe: false, reason: `blocked_protocol:${url.protocol.replace(':', '')}` }
  }

  // Embedded credentials in a crawl target are never legitimate and would be
  // sent to the remote host.
  if (url.username || url.password) return { safe: false, reason: 'embedded_credentials' }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname) return { safe: false, reason: 'missing_host' }

  if (BLOCKED_HOSTNAMES.has(hostname)) return { safe: false, reason: `blocked_host:${hostname}` }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { safe: false, reason: 'blocked_host_suffix' }
  }

  const ipv4 = parseIpv4(hostname)
  if (ipv4) {
    if (hostname === METADATA_IPV4) return { safe: false, reason: 'cloud_metadata_endpoint' }
    if (isPrivateIpv4(ipv4)) return { safe: false, reason: 'private_ip' }
    // A public IP literal is still not a business website we can identify or
    // canonicalize, so it is refused too.
    return { safe: false, reason: 'ip_literal' }
  }

  if (isBlockedIpv6(hostname)) return { safe: false, reason: 'private_ip' }
  if (hostname.includes(':')) return { safe: false, reason: 'ip_literal' }

  // A hostname with no dot cannot be a public domain, and is usually an
  // internal service name.
  if (!hostname.includes('.')) return { safe: false, reason: 'non_public_hostname' }

  if (url.port) {
    const port = Number(url.port)
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return { safe: false, reason: 'invalid_port' }
    if (BLOCKED_PORTS.has(port)) return { safe: false, reason: `blocked_port:${port}` }
  }

  return { safe: true, url }
}

/**
 * Throwing variant, for the fetch path where an unsafe URL must abort the
 * request rather than be handled inline.
 *
 * @param {unknown} value
 * @returns {URL}
 */
export function assertSafeUrl(value) {
  const result = checkUrlSafety(value)
  if (!result.safe) throw new UnsafeUrlError(result.reason)
  return result.url
}

/**
 * Whether a redirect may be followed.
 *
 * Two conditions, both required. The target must independently pass the safety
 * check — a remote server choosing to redirect us at `169.254.169.254` is
 * exactly the attack this module exists for — and it must stay on the same
 * registrable domain, because the crawler's page budget belongs to the site it
 * was pointed at. An off-site redirect is recorded and not followed.
 *
 * @param {string} fromUrl
 * @param {string} toUrl
 * @param {(a: string, b: string) => boolean} isSameSite injected from
 *   domain/domains.js rather than imported, so this module stays a leaf with no
 *   dependency on the domain layer
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkRedirect(fromUrl, toUrl, isSameSite) {
  const safety = checkUrlSafety(toUrl)
  if (!safety.safe) return { allowed: false, reason: `unsafe_redirect:${safety.reason}` }
  if (!isSameSite(fromUrl, toUrl)) return { allowed: false, reason: 'offsite_redirect' }
  return { allowed: true }
}
