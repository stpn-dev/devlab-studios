/**
 * Small HTML utilities for deterministic extraction.
 *
 * No DOM. The Workers runtime has no DOMParser, and HTMLRewriter is a streaming
 * transformer rather than something you can query — so a real parser would mean
 * bundling one into a Worker that also serves the public site. These functions
 * do the four things the extractors actually need (visible text, script hosts,
 * form elements, JSON-LD), and each is a bounded scan over the markup.
 *
 * Everything here treats its input as hostile: page content comes from servers
 * nobody controls, so every scan has a match ceiling and every extracted string
 * is length-bounded by the caller.
 */

/**
 * Visible text, with script/style/noscript content removed.
 *
 * Removing script content is not cosmetic. A page's inline JavaScript contains
 * URLs, email-looking strings and words like "contact" that would otherwise be
 * read as page copy — which is how a site with a chat widget acquires a
 * phantom "call us" signal from the widget's own configuration object.
 *
 * @param {string} html
 * @returns {string}
 */
export function visibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|td|tr|section)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d{1,6});/g, (_match, code) => {
      const point = Number(code)
      return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Lowercased hosts of every external script, iframe and link.
 *
 * Hosts rather than full URLs, because that is what the technology
 * fingerprints match on and it collapses a CDN's thousand distinct asset URLs
 * into one entry.
 *
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Set<string>}
 */
export function externalHosts(html, baseUrl) {
  const hosts = new Set()
  const pattern = /<(?:script|iframe|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']{1,500})["']/gi

  let match
  let considered = 0
  while ((match = pattern.exec(String(html || ''))) !== null && considered < 800) {
    considered += 1
    try {
      hosts.add(new URL(match[1], baseUrl).hostname.toLowerCase())
    } catch {
      // A malformed src is not worth a failure.
    }
  }

  return hosts
}

/**
 * Whether the page contains a form that posts somewhere.
 *
 * A `<form>` with no action and no method is usually a search box or a
 * newsletter widget rendered by a script, so the presence of an action, a
 * method, or a textarea is what distinguishes an actual contact form.
 *
 * @param {string} html
 * @returns {{ hasForm: boolean, hasTextarea: boolean, formCount: number, actions: string[] }}
 */
export function inspectForms(html) {
  const source = String(html || '')
  const forms = source.match(/<form\b[^>]*>/gi) || []
  const actions = forms
    .map((tag) => (tag.match(/\baction\s*=\s*["']([^"']{0,300})["']/i) || [])[1])
    .filter(Boolean)

  return {
    hasForm: forms.length > 0,
    hasTextarea: /<textarea\b/i.test(source),
    formCount: forms.length,
    actions,
  }
}

/**
 * Parses JSON-LD blocks.
 *
 * Structured data is the highest-quality source available: a business that
 * publishes schema.org markup is telling us its own name, address and contact
 * point directly, rather than us inferring them from prose.
 *
 * A malformed block is skipped rather than failing the page — plenty of sites
 * emit JSON-LD with a trailing comma.
 *
 * @param {string} html
 * @returns {object[]}
 */
export function parseJsonLd(html) {
  const blocks = []
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{0,20000}?)<\/script>/gi

  let match
  let considered = 0
  while ((match = pattern.exec(String(html || ''))) !== null && considered < 10) {
    considered += 1
    try {
      const parsed = JSON.parse(match[1].trim())
      // A @graph wrapper is common; flatten it so callers see entities, not
      // containers.
      if (Array.isArray(parsed)) blocks.push(...parsed)
      else if (Array.isArray(parsed?.['@graph'])) blocks.push(...parsed['@graph'])
      else blocks.push(parsed)
    } catch {
      // Malformed JSON-LD is common and not worth surfacing.
    }
  }

  return blocks.filter((block) => block && typeof block === 'object')
}

/**
 * `mailto:` and `tel:` link targets.
 *
 * Stronger evidence than an address found in prose: a mailto link is
 * unambiguously published as a way to make contact, whereas an address in body
 * text might belong to a third party the page is talking about.
 *
 * @param {string} html
 * @returns {{ emails: string[], phones: string[] }}
 */
export function extractContactLinks(html) {
  const emails = []
  const phones = []
  const pattern = /href\s*=\s*["'](mailto|tel):([^"'?]{1,200})/gi

  let match
  let considered = 0
  while ((match = pattern.exec(String(html || ''))) !== null && considered < 200) {
    considered += 1
    const value = decodeURIComponent(match[2].trim())
    if (match[1].toLowerCase() === 'mailto') emails.push(value)
    else phones.push(value)
  }

  return { emails: [...new Set(emails)], phones: [...new Set(phones)] }
}

/**
 * A short excerpt around a matched phrase, for the evidence column.
 *
 * Bounded and whitespace-collapsed. The purpose is that a human reviewing a
 * signal can see the sentence it came from without the engine retaining the
 * page.
 *
 * @param {string} text already visible text
 * @param {string} needle
 * @param {number} [length]
 * @returns {string|null}
 */
export function excerptAround(text, needle, length = 240) {
  const haystack = String(text || '')
  const index = haystack.toLowerCase().indexOf(String(needle).toLowerCase())
  if (index === -1) return null

  const padding = Math.max(0, Math.floor((length - needle.length) / 2))
  const start = Math.max(0, index - padding)
  const excerpt = haystack.slice(start, start + length).trim()

  return `${start > 0 ? '…' : ''}${excerpt}${start + length < haystack.length ? '…' : ''}`
}

/** The page title, for evidence and for corroborating the company name. */
export function pageTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)
  return match ? visibleText(match[1]).slice(0, 200) : null
}

/** The meta description, same purpose. */
export function metaDescription(html) {
  const match = String(html || '').match(
    /<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']{0,500})["']/i,
  )
  return match ? visibleText(match[1]).slice(0, 400) : null
}
