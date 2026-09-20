import { describe, expect, it } from 'vitest'
import PostalMime from 'postal-mime'
import {
  bounceKind,
  extractDsn,
  isDeliveryStatusNotification,
  originalMessageIdFrom,
  parseDeliveryStatus,
  parseDsnAddress,
  parseFieldBlock,
} from './dsn.js'

/**
 * A Postfix-shaped hard bounce, verbatim in structure.
 *
 * This fixture exists to test the PARSER LIBRARY as much as our own code. The
 * design assumes postal-mime surfaces a `message/delivery-status` part as an
 * attachment; if a future version stopped doing that, the bounce path would
 * silently correlate nothing and every other test would still pass.
 */
const HARD_BOUNCE = [
  'Return-Path: <>',
  'From: MAILER-DAEMON@mail.example.net (Mail Delivery System)',
  'To: bounce+d-abc12345@devlabconnect.com',
  'Subject: Undelivered Mail Returned to Sender',
  'Message-ID: <20260920141500.ABCDEF@mail.example.net>',
  'Date: Sun, 20 Sep 2026 14:15:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/report; report-type=delivery-status;',
  '\tboundary="XYZ123"',
  '',
  '--XYZ123',
  'Content-Type: text/plain; charset=us-ascii',
  '',
  'This is the mail system at host mail.example.net.',
  '',
  'I am sorry to have to inform you that your message could not',
  'be delivered to one or more recipients.',
  '',
  '--XYZ123',
  'Content-Type: message/delivery-status',
  '',
  'Reporting-MTA: dns; mail.example.net',
  'X-Postfix-Queue-ID: 9F2A1B',
  'Arrival-Date: Sun, 20 Sep 2026 14:14:58 +0000',
  '',
  'Final-Recipient: rfc822; nobody@prospect.example',
  'Original-Recipient: rfc822;nobody@prospect.example',
  'Action: failed',
  'Status: 5.1.1',
  'Remote-MTA: dns; mx.prospect.example',
  'Diagnostic-Code: smtp; 550 5.1.1 <nobody@prospect.example>: Recipient',
  '\taddress rejected: User unknown in local recipient table',
  '',
  '--XYZ123',
  'Content-Type: message/rfc822-headers',
  '',
  'From: DevLab Studios <hello@devlabconnect.com>',
  'To: nobody@prospect.example',
  'Subject: A question about your booking page',
  'Message-ID: <m.d-abc12345.9f2a1b3c4d5e6f70@devlabconnect.com>',
  'Date: Sun, 20 Sep 2026 14:14:57 +0000',
  '',
  '--XYZ123--',
  '',
].join('\r\n')

const SOFT_BOUNCE = HARD_BOUNCE.replace('Status: 5.1.1', 'Status: 4.2.2').replace('Action: failed', 'Action: delayed')

describe('isDeliveryStatusNotification', () => {
  it('treats a null envelope sender as a DSN on its own', () => {
    // The single most important case: a bounce arrives as MAIL FROM:<>, and
    // code that requires a sender drops every one of them in production while
    // passing every test written with ordinary mail.
    expect(isDeliveryStatusNotification({ envelopeFrom: '' })).toBe(true)
    expect(isDeliveryStatusNotification({ envelopeFrom: '   ' })).toBe(true)
  })

  it('recognises multipart/report even with a sender present', () => {
    expect(
      isDeliveryStatusNotification({
        envelopeFrom: 'mailer-daemon@example.net',
        contentType: 'multipart/report; report-type=delivery-status; boundary="x"',
      }),
    ).toBe(true)
  })

  it('recognises a daemon sender as corroboration', () => {
    expect(isDeliveryStatusNotification({ envelopeFrom: 'x@y.com', fromAddress: 'MAILER-DAEMON@mail.example.net' })).toBe(true)
  })

  it('does not classify ordinary mail as a bounce', () => {
    expect(
      isDeliveryStatusNotification({
        envelopeFrom: 'jane@prospect.example',
        contentType: 'text/plain; charset=utf-8',
        fromAddress: 'jane@prospect.example',
      }),
    ).toBe(false)
  })
})

describe('field parsing', () => {
  it('unfolds continuation lines so a wrapped diagnostic is not truncated', () => {
    const fields = new Map(
      parseFieldBlock('Diagnostic-Code: smtp; 550 5.1.1 <a@b>: Recipient\r\n\taddress rejected: User unknown'),
    )
    expect(fields.get('diagnostic-code')).toBe('smtp; 550 5.1.1 <a@b>: Recipient address rejected: User unknown')
  })

  it('strips the rfc822 address-type prefix', () => {
    expect(parseDsnAddress('rfc822; nobody@prospect.example')).toBe('nobody@prospect.example')
    expect(parseDsnAddress('rfc822;nobody@prospect.example')).toBe('nobody@prospect.example')
    expect(parseDsnAddress('rfc822; <nobody@prospect.example>')).toBe('nobody@prospect.example')
    expect(parseDsnAddress('')).toBeNull()
  })

  it('skips the per-message block instead of reading Reporting-MTA as a recipient', () => {
    const reports = parseDeliveryStatus(
      'Reporting-MTA: dns; mail.example.net\r\n\r\nFinal-Recipient: rfc822; a@b.com\r\nAction: failed\r\nStatus: 5.1.1',
    )
    expect(reports).toHaveLength(1)
    expect(reports[0].recipient).toBe('a@b.com')
  })

  it('reads several recipients from one report', () => {
    const reports = parseDeliveryStatus(
      [
        'Reporting-MTA: dns; mail.example.net',
        '',
        'Final-Recipient: rfc822; a@b.com',
        'Action: delayed',
        'Status: 4.4.1',
        '',
        'Final-Recipient: rfc822; c@d.com',
        'Action: failed',
        'Status: 5.1.1',
      ].join('\r\n'),
    )
    expect(reports.map((report) => report.recipient)).toEqual(['a@b.com', 'c@d.com'])
  })
})

describe('bounceKind', () => {
  it('reads permanence from the status class, not the reply text', () => {
    expect(bounceKind({ status: '5.1.1' })).toBe('hard')
    expect(bounceKind({ status: '5.7.1' })).toBe('hard')
    expect(bounceKind({ status: '4.2.2' })).toBe('soft')
    expect(bounceKind({ status: '4.4.1', action: 'failed' })).toBe('soft')
  })

  it('falls back to Action when there is no Status', () => {
    expect(bounceKind({ action: 'failed' })).toBe('hard')
    expect(bounceKind({ action: 'delayed' })).toBe('soft')
  })

  it('defaults to soft when it cannot tell', () => {
    // Under-suppressing costs one retry. Over-suppressing is permanent and is
    // only undone by a human on the Suppression screen.
    expect(bounceKind({})).toBe('soft')
    expect(bounceKind({ status: 'nonsense' })).toBe('soft')
  })
})

describe('originalMessageIdFrom', () => {
  it('finds the Message-ID in returned headers', () => {
    expect(originalMessageIdFrom('From: a@b\r\nMessage-ID: <m.d-xyz.abc@devlabconnect.com>\r\n')).toBe(
      'm.d-xyz.abc@devlabconnect.com',
    )
  })

  it('handles a folded Message-ID header', () => {
    expect(originalMessageIdFrom('Message-ID:\r\n\t<m.d-xyz.abc@devlabconnect.com>')).toBe(
      'm.d-xyz.abc@devlabconnect.com',
    )
  })

  it('returns null when there is none', () => {
    expect(originalMessageIdFrom('From: a@b\r\n')).toBeNull()
    expect(originalMessageIdFrom('')).toBeNull()
  })
})

describe('extractDsn, against postal-mime', () => {
  it('reads a hard bounce end to end', async () => {
    const parsed = await PostalMime.parse(HARD_BOUNCE)
    const dsn = extractDsn(parsed)

    expect(dsn.kind).toBe('hard')
    expect(dsn.primary?.recipient).toBe('nobody@prospect.example')
    expect(dsn.primary?.status).toBe('5.1.1')
    expect(dsn.primary?.action).toBe('failed')
    expect(dsn.primary?.diagnostic).toContain('User unknown')
    // The correlation route that does not depend on the envelope sender.
    expect(dsn.originalMessageId).toBe('m.d-abc12345.9f2a1b3c4d5e6f70@devlabconnect.com')
  })

  it('reads a transient failure as soft', async () => {
    const parsed = await PostalMime.parse(SOFT_BOUNCE)
    const dsn = extractDsn(parsed)

    expect(dsn.kind).toBe('soft')
    expect(dsn.primary?.status).toBe('4.2.2')
  })

  it('reports the most severe recipient when a DSN covers several', async () => {
    const multi = HARD_BOUNCE.replace(
      'Final-Recipient: rfc822; nobody@prospect.example',
      'Final-Recipient: rfc822; delayed@prospect.example\r\nAction: delayed\r\nStatus: 4.4.1\r\n\r\nFinal-Recipient: rfc822; nobody@prospect.example',
    )
    const dsn = extractDsn(await PostalMime.parse(multi))
    expect(dsn.kind).toBe('hard')
    expect(dsn.primary?.recipient).toBe('nobody@prospect.example')
  })

  it('does not throw on a message that is not a DSN at all', async () => {
    const ordinary = ['From: jane@prospect.example', 'To: hello@devlabconnect.com', 'Subject: Hi', '', 'Sounds good.', ''].join('\r\n')
    const dsn = extractDsn(await PostalMime.parse(ordinary))
    expect(dsn.reports).toEqual([])
    expect(dsn.primary).toBeNull()
    expect(dsn.originalMessageId).toBeNull()
  })
})
