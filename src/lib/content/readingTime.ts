/**
 * Reading time, derived from the body rather than typed by hand.
 *
 * The stored `reading_time_minutes` column had drifted into fiction: a
 * 300-word post carried "5 min read". That is a small claim, but it is still a
 * claim the page cannot evidence, on a site whose whole position is that it
 * does not make those. Deriving it means the number cannot disagree with the
 * article underneath it.
 */

/** Roughly the middle of the commonly cited 200–250 wpm range for online prose. */
const WORDS_PER_MINUTE = 225

export function countWords(body: string): number {
  return String(body || '')
    .replace(/^##\s+/gm, '')
    .replace(/^-\s+/gm, '')
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * Whole minutes, never zero — a one-line note is still "1 min read", which is
 * honest, where "0 min read" would just look broken.
 */
export function readingTimeMinutes(body: string): number | null {
  const words = countWords(body)
  if (words === 0) return null
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}
