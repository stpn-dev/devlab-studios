import { describe, expect, it } from 'vitest'
import { ZOHO } from '../config/defaults.js'
import {
  OPT_OUT_KEYWORD,
  buildUnsubscribeInstruction,
  detectOptOut,
  messageContainsOptOutInstruction,
} from './optOut.js'

const IDENTITY = Object.freeze({
  legalName: 'DevLab Studios',
  senderName: 'Stephen',
  senderEmail: 'hello@devlabstudios.com',
})

describe('detectOptOut', () => {
  it('detects plain unsubscribe requests', () => {
    const phrases = [
      'Please unsubscribe me.',
      'Remove me from your list.',
      'Take me off this mailing list please.',
      'I want to opt out.',
      'Please opt-out my address.',
      'I no longer wish to receive these.',
      'Please stop.',
    ]

    for (const phrase of phrases) {
      const result = detectOptOut(phrase)
      expect(result.detected, phrase).toBe(true)
      expect(result.kind, phrase).toBe('unsubscribe')
      expect(result.matchedPhrase, phrase).toBeTruthy()
    }
  })

  it('detects do-not-contact demands as their own kind', () => {
    const phrases = [
      'Do not contact me again.',
      "Don't contact me.",
      'Please stop emailing me.',
      'Never email us again.',
      'Stop sending me things.',
      'Lose my email address.',
    ]

    for (const phrase of phrases) {
      const result = detectOptOut(phrase)
      expect(result.detected, phrase).toBe(true)
      expect(result.kind, phrase).toBe('do_not_contact')
    }
  })

  it('detects spam complaints', () => {
    expect(detectOptOut('This is spam.').kind).toBe('complaint')
    expect(detectOptOut('I have reported this as spam.').kind).toBe('complaint')
    expect(detectOptOut('Marking this as spam.').kind).toBe('complaint')
  })

  it('reports the most severe kind when a message contains several', () => {
    const result = detectOptOut('This is spam, unsubscribe me immediately.')
    expect(result.kind).toBe('complaint')
  })

  it('honours a bare STOP reply, because that is the mechanism we advertise', () => {
    const result = detectOptOut('STOP')
    expect(result.detected).toBe(true)
    expect(result.kind).toBe('unsubscribe')
    expect(result.matchedPhrase).toBe(OPT_OUT_KEYWORD)
  })

  it('scans the subject line as well as the body', () => {
    const result = detectOptOut('', 'Unsubscribe')
    expect(result.detected).toBe(true)
    expect(result.kind).toBe('unsubscribe')
  })

  it('does not fire on ordinary prospect replies', () => {
    const phrases = [
      'Thanks, this is interesting. Can we talk next week?',
      'We had to stop using our old vendor last year.',
      'Send me the pricing and I will take it to the owner.',
    ]

    for (const phrase of phrases) {
      expect(detectOptOut(phrase).detected, phrase).toBe(false)
    }
  })

  it('does not fire on a negated mention of opting out', () => {
    const result = detectOptOut("I don't want to opt out of the conversation, just slow it down.")
    expect(result.detected).toBe(false)
    expect(result.kind).toBeNull()
  })

  it('still fires when a negated mention is followed by a real request', () => {
    const result = detectOptOut(
      "I don't want to opt out of the project chat, but please unsubscribe me from the newsletter.",
    )
    expect(result.detected).toBe(true)
    expect(result.matchedPhrase).toBe('unsubscribe')
  })

  it('ignores quoted text, so a reply that quotes our own footer is not an opt-out', () => {
    const body = [
      "Sounds good, let's set up a call.",
      '',
      '> If you would prefer not to hear from us, reply to this email with STOP',
      '> and we will not contact you again.',
    ].join('\n')

    expect(detectOptOut(body).detected).toBe(false)
  })

  it('does not fire on our own outreach footer, which is scanned alongside drafts', () => {
    expect(detectOptOut(buildUnsubscribeInstruction(IDENTITY)).detected).toBe(false)
  })

  it('treats empty and malformed input as no request', () => {
    for (const value of [null, undefined, '', '   ', 42]) {
      expect(detectOptOut(value).detected).toBe(false)
    }
  })

  it('bounds the text it scans', () => {
    const beyondTheCap = `${'a'.repeat(ZOHO.maxBodyChars)} please unsubscribe me`
    expect(detectOptOut(beyondTheCap).detected).toBe(false)
  })
})

describe('buildUnsubscribeInstruction', () => {
  it('produces a reply-with-STOP line naming the configured sender address', () => {
    const line = buildUnsubscribeInstruction(IDENTITY)

    expect(line).toContain(OPT_OUT_KEYWORD)
    expect(line).toContain('hello@devlabstudios.com')
    expect(line).toContain('Stephen')
  })

  it('produces nothing when no sender address is configured', () => {
    expect(buildUnsubscribeInstruction({ senderName: 'Stephen' })).toBe('')
    expect(buildUnsubscribeInstruction({})).toBe('')
    expect(buildUnsubscribeInstruction(undefined)).toBe('')
  })

  it('falls back to the legal name when no sender name is set', () => {
    const line = buildUnsubscribeInstruction({ legalName: 'DevLab Studios', senderEmail: 'hello@devlabstudios.com' })
    expect(line).toContain('DevLab Studios')
  })
})

describe('messageContainsOptOutInstruction', () => {
  it('finds the instruction this module builds', () => {
    const body = `Hi there,\n\nShort note about your intake form.\n\n${buildUnsubscribeInstruction(IDENTITY)}`
    expect(messageContainsOptOutInstruction(body)).toBe(true)
  })

  it('accepts a reworded instruction that still states the mechanism', () => {
    expect(messageContainsOptOutInstruction('Just reply STOP and I will leave you alone.')).toBe(true)
  })

  it('rejects a draft that mentions opting out without giving a mechanism', () => {
    expect(messageContainsOptOutInstruction('You can unsubscribe at any time.')).toBe(false)
    expect(messageContainsOptOutInstruction('Reply if you are interested.')).toBe(false)
  })

  it('rejects empty and malformed input', () => {
    for (const value of [null, undefined, '', 42]) {
      expect(messageContainsOptOutInstruction(value)).toBe(false)
    }
  })
})
