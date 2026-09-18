import { describe, expect, it } from 'vitest'
import { countWords, readingTimeMinutes } from './readingTime'

describe('countWords', () => {
  it('counts the words a reader actually reads, not the markup around them', () => {
    expect(countWords('## A heading\n\n- one item\n- two item\n\nA sentence here.')).toBe(9)
  })

  it('is zero for an empty or whitespace-only body', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\n  ')).toBe(0)
  })
})

describe('readingTimeMinutes', () => {
  it('derives minutes from length', () => {
    expect(readingTimeMinutes(Array(900).fill('word').join(' '))).toBe(4)
    expect(readingTimeMinutes(Array(2250).fill('word').join(' '))).toBe(10)
  })

  it('never reports zero minutes for an article that has words in it', () => {
    expect(readingTimeMinutes('One short line.')).toBe(1)
  })

  it('returns null for an empty body rather than claiming a duration', () => {
    expect(readingTimeMinutes('')).toBeNull()
  })

  it('does not reproduce the stored claim that a 300-word post is a 5 minute read', () => {
    const shortPost = Array(300).fill('word').join(' ')
    expect(readingTimeMinutes(shortPost)).toBeLessThanOrEqual(2)
  })
})
