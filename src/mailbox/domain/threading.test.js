import { describe, expect, it } from 'vitest'
import { candidateParentIds, normalizeSubject, subjectMatches } from './threading.js'

describe('normalizeSubject', () => {
  it('strips reply and forward prefixes', () => {
    expect(normalizeSubject('Re: A question')).toBe('a question')
    expect(normalizeSubject('FWD: A question')).toBe('a question')
    expect(normalizeSubject('Re: Fwd: Re: A question')).toBe('a question')
    expect(normalizeSubject('AW: Eine Frage')).toBe('eine frage')
    expect(normalizeSubject('Re[2]: A question')).toBe('a question')
  })

  it('leaves an ordinary subject alone', () => {
    expect(normalizeSubject('Rescheduling our call')).toBe('rescheduling our call')
    // "Res:" is a real prefix, but only with the colon — `Research` must survive.
    expect(normalizeSubject('Research budget')).toBe('research budget')
  })

  it('does not spin on a crafted subject', () => {
    const attack = `${'Re: '.repeat(10_000)}payload`
    const started = Date.now()
    const result = normalizeSubject(attack)
    expect(Date.now() - started).toBeLessThan(500)
    // Bounded stripping leaves some prefixes behind, which is fine: the worst
    // case is that two messages fail to match and become separate threads.
    expect(result.endsWith('payload')).toBe(true)
  })

  it('handles empty input', () => {
    expect(normalizeSubject(null)).toBe('')
    expect(normalizeSubject('   ')).toBe('')
  })
})

describe('subjectMatches', () => {
  const now = new Date('2026-09-20T12:00:00Z')
  const thread = {
    mailbox: 'hello',
    correspondent: 'jane@prospect.example',
    subject: 'A question about your booking page',
    lastMessageAt: '2026-09-18T12:00:00Z',
  }
  const incoming = {
    mailbox: 'hello',
    correspondent: 'jane@prospect.example',
    subject: 'Re: A question about your booking page',
  }

  it('matches when all four conditions hold', () => {
    expect(subjectMatches(thread, incoming, now)).toBe(true)
  })

  it('refuses across mailboxes', () => {
    expect(subjectMatches({ ...thread, mailbox: 'bounce' }, incoming, now)).toBe(false)
  })

  it('refuses a different correspondent', () => {
    // Without this, every "Re: Invoice" from every sender collapses into one
    // thread — which is what an unfenced subject heuristic actually does.
    expect(subjectMatches(thread, { ...incoming, correspondent: 'bob@other.example' }, now)).toBe(false)
  })

  it('refuses a different subject', () => {
    expect(subjectMatches(thread, { ...incoming, subject: 'Something else' }, now)).toBe(false)
  })

  it('refuses an empty subject, which carries no information', () => {
    expect(subjectMatches({ ...thread, subject: '' }, { ...incoming, subject: '' }, now)).toBe(false)
  })

  it('refuses outside the window', () => {
    expect(subjectMatches({ ...thread, lastMessageAt: '2026-07-01T12:00:00Z' }, incoming, now)).toBe(false)
    expect(subjectMatches({ ...thread, lastMessageAt: null }, incoming, now)).toBe(false)
  })

  it('survives nonsense input', () => {
    expect(subjectMatches(null, incoming, now)).toBe(false)
    expect(subjectMatches(thread, null, now)).toBe(false)
    expect(subjectMatches({ ...thread, lastMessageAt: 'not a date' }, incoming, now)).toBe(false)
  })
})

describe('candidateParentIds', () => {
  it('puts In-Reply-To first, then References nearest-ancestor first', () => {
    // References is oldest-first, so its LAST entry is the nearest ancestor.
    // Walking it forwards would match the thread root and lose the position.
    expect(candidateParentIds({ inReplyTo: 'c@x', references: ['a@x', 'b@x', 'c@x'] })).toEqual([
      'c@x',
      'b@x',
      'a@x',
    ])
  })

  it('works with only one of the two', () => {
    expect(candidateParentIds({ inReplyTo: 'a@x' })).toEqual(['a@x'])
    expect(candidateParentIds({ references: ['a@x', 'b@x'] })).toEqual(['b@x', 'a@x'])
    expect(candidateParentIds({})).toEqual([])
  })
})
