/**
 * Post-validation of generated message text.
 *
 * Schema validation (ai/schemas.js) proves the model returned the right SHAPE.
 * This proves it did not write the things it was told not to write. The two are
 * separate because the shape is machine-checkable in a way the content is not,
 * and conflating them would hide the fact that this layer is heuristic.
 *
 * These checks are deliberately crude and deliberately loud. A draft that trips
 * one is NOT silently rewritten and NOT automatically regenerated: it is stored
 * as it came back, with the violations attached, and the reviewer sees exactly
 * what the model claimed. Regenerating is a button a human presses.
 *
 * That is the honest outcome. A person reads every one of these before sending
 * it, and the worst thing this layer could do is quietly launder a false claim
 * into something that looks clean.
 */

/**
 * Patterns for claims the prompts forbid.
 *
 * Each is `[code, RegExp, description]`. Tuned toward catching real violations
 * over avoiding false positives, because a false positive costs one
 * regeneration and a false negative costs a false statement sent to a stranger.
 */
const INVENTION_PATTERNS = Object.freeze([
  ['PRICE_CLAIM', /(?:\$|usd|php|₱|£|€)\s?\d|(?:\b\d+k\b.{0,20}(?:budget|cost|price|fee))|\b(?:our (?:rate|pricing)|costs? (?:only|just|around|about)|starting at|per hour|hourly rate|day rate|flat fee|retainer of)\b/i,
    'states or implies a price'],
  ['METRIC_CLAIM', /\b\d{1,3}\s?%|\b(?:\d+x)\b|\b(?:saved|cut|reduced|increased|boosted|improved|grew)\b[^.]{0,40}\b(?:\d+|half|double|triple)\b/i,
    'cites a metric or result'],
  ['CLIENT_CLAIM', /\b(?:one of our clients|another client|a client of ours|worked with|our client|for a similar (?:company|firm|business)|case study|we helped .{0,40}\b(?:achieve|save|grow|increase))\b/i,
    'references a past client or case study'],
  // Case-insensitive throughout: a sentence-initial "Your team manually
  // processes..." is the most common form of this violation, and a
  // case-sensitive pattern misses exactly that one.
  ['INTERNAL_KNOWLEDGE_CLAIM', /\b(?:your (?:team|staff|office) (?:manually |currently )?(?:process|processes|handle|handles|spend|spends|waste|wastes)|i (?:know|can see) (?:that )?your (?:team|staff|company) (?:is|are|does|uses)|you(?:'re| are) (?:currently )?(?:using|running) \w)/i,
    'claims knowledge of internal processes or systems'],
  ['TIMELINE_COMMITMENT', /\b(?:we can (?:deliver|build|ship|have it (?:done|ready))|ready (?:in|within) \d|turnaround of \d|guaranteed? (?:in|within|by))\b/i,
    'commits to a delivery timeline'],
  ['FALSE_PRETEXT', /\b(?:as (?:we )?discussed|following up on our (?:call|conversation|meeting)|per our (?:last )?(?:call|conversation)|(?:\w+) (?:suggested|recommended) i (?:reach out|get in touch)|you (?:signed up|requested|downloaded|filled))\b/i,
    'invents a prior conversation or referral'],
  ['CREDENTIAL_CLAIM', /\b(?:award-winning|certified partner|official partner|iso ?900\d|gartner|forrester|#1 (?:rated|ranked))\b/i,
    'claims an award, certification or partnership'],
])

/**
 * Checks generated message text for forbidden claims.
 *
 * @param {string} text
 * @returns {Array<{ code: string, description: string, excerpt: string }>}
 */
export function findInventedClaims(text) {
  const body = String(text ?? '')
  const violations = []

  for (const [code, pattern, description] of INVENTION_PATTERNS) {
    const match = body.match(pattern)
    if (!match) continue
    const index = match.index ?? 0
    violations.push({
      code,
      description,
      excerpt: body.slice(Math.max(0, index - 40), index + match[0].length + 40).replace(/\s+/g, ' ').trim(),
    })
  }

  return violations
}

/**
 * Checks that no link appears in the text beyond those explicitly allowed.
 *
 * A model inventing a URL is not a hypothetical: asked to write outreach it
 * will cheerfully add `https://devlabstudios.com/case-studies`, which does not
 * exist. Comparing by normalized URL rather than substring means a tracked link
 * with a different query string is still recognized as the one that was
 * allowed.
 *
 * @param {string} text
 * @param {string[]} allowedLinks
 * @returns {string[]} the disallowed URLs found
 */
export function findDisallowedLinks(text, allowedLinks = []) {
  const allowed = new Set(
    allowedLinks
      .map((link) => {
        try {
          return new URL(link).toString()
        } catch {
          return null
        }
      })
      .filter(Boolean),
  )

  const found = String(text ?? '').match(/https?:\/\/[^\s<>"')\]]+/gi) || []

  return [...new Set(found)]
    .map((raw) => raw.replace(/[.,;:!?]+$/, ''))
    .filter((raw) => {
      try {
        return !allowed.has(new URL(raw).toString())
      } catch {
        return true
      }
    })
}

/**
 * Checks that the observations a draft claims to rest on were actually
 * extracted.
 *
 * Word-overlap rather than exact matching: the model paraphrases, and requiring
 * a literal quote would reject every honest draft. A claimed observation
 * is treated as supported when it shares at least two meaningful words with
 * something we actually recorded -- a deliberately forgiving bar, because this
 * is a backstop behind the human review and a false positive here costs a
 * regeneration on a draft that was fine.
 *
 * @param {string[]} claimed
 * @param {string[]} available signal labels, values and evidence excerpts
 * @returns {string[]} the claims with no supporting evidence
 */
export function findUnsupportedObservations(claimed, available) {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are',
    'their', 'they', 'your', 'you', 'we', 'it', 'that', 'this', 'with', 'at',
    'site', 'page', 'website', 'business', 'company',
  ])

  const tokenize = (value) =>
    new Set(
      String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
    )

  const haystacks = available.map(tokenize)

  return (claimed || []).filter((claim) => {
    const words = tokenize(claim)
    if (words.size === 0) return false

    // A one- or two-word claim has to match entirely; anything longer needs two
    // words in common. A single shared word is coincidence, not support.
    const required = words.size <= 2 ? words.size : 2

    return !haystacks.some((haystack) => {
      const overlap = [...words].filter((word) => haystack.has(word)).length
      return overlap >= required
    })
  })
}

/**
 * The full content check for a generated message.
 *
 * @param {{ subject?: string, body: string, referencedObservations?: string[] }} draft
 * @param {{ allowedLinks?: string[], availableEvidence?: string[] }} [context]
 * @returns {{ ok: boolean, violations: Array<{ code: string, description: string, excerpt?: string }> }}
 */
export function validateGeneratedMessage(draft, context = {}) {
  const text = `${draft.subject || ''}\n${draft.body || ''}`
  const violations = findInventedClaims(text)

  for (const link of findDisallowedLinks(text, context.allowedLinks || [])) {
    violations.push({ code: 'DISALLOWED_LINK', description: 'includes a link that was not supplied', excerpt: link })
  }

  if (context.availableEvidence) {
    for (const claim of findUnsupportedObservations(draft.referencedObservations, context.availableEvidence)) {
      violations.push({ code: 'UNSUPPORTED_OBSERVATION', description: 'rests on something we did not observe', excerpt: claim })
    }
  }

  return { ok: violations.length === 0, violations }
}
