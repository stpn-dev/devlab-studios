import { describe, it, expect } from 'vitest'
import { chunkValues, mergeReferenceMaps } from './mediaAssets.js'

describe('chunkValues', () => {
  it('splits values into chunks no larger than chunkSize', () => {
    const values = Array.from({ length: 205 }, (_, index) => `value-${index}`)
    const chunks = chunkValues(values, 90)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(90)
    expect(chunks[1]).toHaveLength(90)
    expect(chunks[2]).toHaveLength(25)
    expect(chunks.flat()).toEqual(values)
  })

  it('returns a single chunk when values fit within chunkSize', () => {
    const values = ['a', 'b', 'c']
    expect(chunkValues(values, 90)).toEqual([['a', 'b', 'c']])
  })

  it('returns no chunks for an empty array', () => {
    expect(chunkValues([], 90)).toEqual([])
  })
})

describe('mergeReferenceMaps', () => {
  it('combines per-chunk reference maps back into one map keyed by every original value', () => {
    const values = ['a', 'b', 'c']
    const chunkMaps = [
      new Map([['a', [{ type: 'Project', id: '1' }]], ['b', []]]),
      new Map([['c', [{ type: 'Insight cover', id: '2' }]]]),
    ]

    const merged = mergeReferenceMaps(chunkMaps, values)

    expect(merged.get('a')).toEqual([{ type: 'Project', id: '1' }])
    expect(merged.get('b')).toEqual([])
    expect(merged.get('c')).toEqual([{ type: 'Insight cover', id: '2' }])
  })

  it('accumulates references for the same value found in more than one chunk map', () => {
    const values = ['a']
    const chunkMaps = [
      new Map([['a', [{ type: 'Project', id: '1' }]]]),
      new Map([['a', [{ type: 'Insight cover', id: '2' }]]]),
    ]

    const merged = mergeReferenceMaps(chunkMaps, values)

    expect(merged.get('a')).toEqual([{ type: 'Project', id: '1' }, { type: 'Insight cover', id: '2' }])
  })
})
