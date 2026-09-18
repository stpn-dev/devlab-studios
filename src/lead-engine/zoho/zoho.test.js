import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertNoSendMode,
  buildZohoUrl,
  checkConnection,
  clearFolderCache,
  createDraft,
  getMessageContent,
  listMessages,
  resolveFolderId,
} from './client.js'
import { clearTokenCache, getAccessToken, readZohoConfig, redactZohoError } from './oauth.js'
import {
  extractPlainBody,
  normalizeZohoMessage,
  parseAddressList,
  parseDisplayName,
  parseZohoTimestamp,
  stripQuotedHistory,
} from './normalize.js'
import {
  counterpartAddresses,
  matchMessageToConversation,
  normalizeMessageId,
  parseMessageIdList,
  withinTimeProximity,
} from './threadMatch.js'

const ENV = {
  ZOHO_MAIL_ENABLED: 'true',
  ZOHO_ACCOUNT_ID: 'acct-1',
  ZOHO_USER_EMAIL: 'stephen@devlabstudios.com',
  ZOHO_OAUTH_CLIENT_ID: 'client-1',
  ZOHO_OAUTH_CLIENT_SECRET: 'secret-1',
  ZOHO_OAUTH_REFRESH_TOKEN: '1000.refresh',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** A fetch stub that answers the token endpoint and routes everything else. */
function zohoFetch(handler) {
  return vi.fn(async (url, init) => {
    if (String(url).includes('/oauth/v2/token')) {
      return json({ access_token: '1000.access', expires_in: 3600 })
    }
    return handler(String(url), init)
  })
}

beforeEach(() => {
  clearTokenCache()
  clearFolderCache()
})

describe('readZohoConfig', () => {
  it('reports exactly which variables are missing', () => {
    const config = readZohoConfig({ ZOHO_ACCOUNT_ID: 'a' })
    expect(config.isConfigured).toBe(false)
    expect(config.missing).toEqual(['userEmail', 'clientId', 'clientSecret', 'refreshToken'])
  })

  it('is fully configured with every variable present', () => {
    expect(readZohoConfig(ENV).isConfigured).toBe(true)
  })

  it('falls back to the documented API base URL', () => {
    expect(readZohoConfig(ENV).apiBaseUrl).toBe('https://mail.zoho.com/api')
  })
})

describe('redactZohoError', () => {
  it('removes credential material from anything that will be stored or logged', () => {
    const redacted = redactZohoError(
      'failed: client_secret=abc123&refresh_token=1000.def456 {"access_token":"1000.ghi"} Bearer 1000.jkl',
    )
    expect(redacted).not.toContain('abc123')
    expect(redacted).not.toContain('def456')
    expect(redacted).not.toContain('1000.ghi')
    expect(redacted).not.toContain('1000.jkl')
    expect(redacted).toContain('[redacted]')
  })

  it('redacts a bare Zoho token anywhere in the string', () => {
    const redacted = redactZohoError('unexpected token 1000.abcdefghijklmnopqrstuvwxyz123456 in response')
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })

  it('bounds the result', () => {
    expect(redactZohoError('x'.repeat(5_000)).length).toBeLessThanOrEqual(500)
  })
})

describe('getAccessToken', () => {
  it('refuses to call out when configuration is incomplete', async () => {
    const fetchImpl = vi.fn()
    await expect(getAccessToken({ ZOHO_ACCOUNT_ID: 'a' }, { fetchImpl })).rejects.toMatchObject({
      code: 'zoho_not_configured',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('exchanges the refresh token and caches the result', async () => {
    const fetchImpl = vi.fn(async () => json({ access_token: '1000.access', expires_in: 3600 }))

    expect(await getAccessToken(ENV, { fetchImpl })).toBe('1000.access')
    expect(await getAccessToken(ENV, { fetchImpl })).toBe('1000.access')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refreshes when the cached token is near expiry', async () => {
    const fetchImpl = vi.fn(async () => json({ access_token: '1000.access', expires_in: 3600 }))

    await getAccessToken(ENV, { fetchImpl, now: () => 0 })
    await getAccessToken(ENV, { fetchImpl, now: () => 3_600_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('distinguishes a dead refresh token, which needs a human', async () => {
    const fetchImpl = async () => json({ error: 'invalid_grant' }, 400)
    await expect(getAccessToken(ENV, { fetchImpl })).rejects.toMatchObject({
      code: 'zoho_reauthorization_required',
      status: 401,
    })
  })

  it('does not leak the secret into the thrown message', async () => {
    const fetchImpl = async () => json({ error: 'invalid_client client_secret=secret-1' }, 400)
    await expect(getAccessToken(ENV, { fetchImpl })).rejects.toThrow(/\[redacted\]/)
  })
})

describe('createDraft — the send guarantee', () => {
  it('posts mode=draft and nothing else', async () => {
    let captured = null
    const fetchImpl = zohoFetch(async (url, init) => {
      captured = JSON.parse(init.body)
      return json({ data: { draftId: 'draft-1', messageId: 'msg-1' } })
    })

    const result = await createDraft(
      ENV,
      { to: 'hello@acme.com', subject: 'Your intake process', bodyText: 'Hello.' },
      { fetchImpl },
    )

    expect(captured.mode).toBe('draft')
    expect(result.draftId).toBe('draft-1')
  })

  it('never sends: no request in this module can carry a send mode', async () => {
    let captured = null
    const fetchImpl = zohoFetch(async (url, init) => {
      captured = JSON.parse(init.body)
      return json({ data: { draftId: 'draft-1' } })
    })

    // Even a caller explicitly trying to send gets a draft — `mode` is a
    // literal in createDraft and is not reachable from the arguments.
    await createDraft(ENV, { to: 'a@b.com', subject: 's', bodyText: 'b', mode: 'sendMail' }, { fetchImpl })

    expect(captured.mode).toBe('draft')
    expect(JSON.stringify(captured)).not.toContain('sendMail')
  })

  it('exposes no send function at all', async () => {
    const module = await import('./client.js')
    const sendLike = Object.keys(module).filter((name) => /^send|sendMail|transmit|deliver/i.test(name))
    expect(sendLike).toEqual([])
  })

  it('refuses a payload carrying a send or schedule mode', () => {
    expect(() => assertNoSendMode({ mode: 'sendMail' })).toThrow(/never sends mail/i)
    expect(() => assertNoSendMode({ mode: 'draft', scheduleType: 1 })).toThrow(/never sends mail/i)
    expect(() => assertNoSendMode({ mode: 'draft' })).not.toThrow()
  })

  it('refuses when Zoho is not configured, without calling out', async () => {
    const fetchImpl = vi.fn()
    await expect(
      createDraft({ ZOHO_ACCOUNT_ID: 'a' }, { to: 'a@b.com', subject: 's', bodyText: 'b' }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'zoho_not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('surfaces an API failure as retryable or not, so the job runner can decide', async () => {
    const serverError = zohoFetch(async () => json({ message: 'boom' }, 503))
    await expect(createDraft(ENV, { to: 'a@b.com', subject: 's', bodyText: 'b' }, { fetchImpl: serverError }))
      .rejects.toMatchObject({ retryable: true })

    const badRequest = zohoFetch(async () => json({ data: { errorCode: 'INVALID_DATA' } }, 400))
    await expect(createDraft(ENV, { to: 'a@b.com', subject: 's', bodyText: 'b' }, { fetchImpl: badRequest }))
      .rejects.toMatchObject({ retryable: false })
  })

  it('retries once with a forced refresh on a 401', async () => {
    let attempts = 0
    const fetchImpl = zohoFetch(async () => {
      attempts += 1
      return attempts === 1 ? json({}, 401) : json({ data: { draftId: 'draft-1' } })
    })

    const result = await createDraft(ENV, { to: 'a@b.com', subject: 's', bodyText: 'b' }, { fetchImpl })
    expect(result.draftId).toBe('draft-1')
    expect(attempts).toBe(2)
  })
})

/**
 * A mailbox whose folder list comes back in the shape Zoho actually returns.
 *
 * `folderType` is the field that matters: Zoho localises DISPLAY names, so a
 * non-English mailbox has no folder called "Inbox" but still has one typed
 * `Inbox`.
 */
const FOLDERS = [
  { folderId: '100', folderName: 'Inbox', folderType: 'Inbox', path: '/Inbox' },
  { folderId: '200', folderName: 'Sent', folderType: 'Sent', path: '/Sent' },
  { folderId: '300', folderName: 'Drafts', folderType: 'Drafts', path: '/Drafts' },
]

/** Answers the folder lookup, then delegates everything else. */
function mailboxFetch(handler, folders = FOLDERS) {
  return zohoFetch(async (url, init) => {
    if (String(url).includes('/folders')) return json({ data: folders })
    return handler(String(url), init)
  })
}

describe('folder resolution', () => {
  it('resolves inbox and sent to the folder ids for this account', async () => {
    const fetchImpl = mailboxFetch(async () => json({ data: [] }))

    expect(await resolveFolderId(ENV, 'inbox', { fetchImpl })).toBe('100')
    clearFolderCache()
    expect(await resolveFolderId(ENV, 'sent', { fetchImpl })).toBe('200')
  })

  it('matches on folderType, so a localised mailbox still works', async () => {
    // A Spanish-language mailbox: no folder is NAMED Inbox.
    const localised = [
      { folderId: '100', folderName: 'Bandeja de entrada', folderType: 'Inbox', path: '/Bandeja de entrada' },
      { folderId: '200', folderName: 'Enviados', folderType: 'Sent', path: '/Enviados' },
    ]
    const fetchImpl = mailboxFetch(async () => json({ data: [] }), localised)

    expect(await resolveFolderId(ENV, 'inbox', { fetchImpl })).toBe('100')
  })

  it('reads the capitalised field names older Zoho responses use', async () => {
    const legacy = [{ FolderID: '900', FolderName: 'Inbox', FolderType: 'Inbox' }]
    const fetchImpl = mailboxFetch(async () => json({ data: [] }), legacy)

    expect(await resolveFolderId(ENV, 'inbox', { fetchImpl })).toBe('900')
  })

  it('looks the folder list up once per isolate', async () => {
    let lookups = 0
    const fetchImpl = zohoFetch(async (url) => {
      if (String(url).includes('/folders')) {
        lookups += 1
        return json({ data: FOLDERS })
      }
      return json({ data: [] })
    })

    await listMessages(ENV, { folder: 'inbox' }, { fetchImpl })
    await listMessages(ENV, { folder: 'inbox' }, { fetchImpl })

    expect(lookups).toBe(1)
  })

  it('fails with a message naming the folders it did find', async () => {
    const fetchImpl = mailboxFetch(async () => json({ data: [] }), [
      { folderId: '1', folderName: 'Archive', folderType: 'Archive' },
    ])

    await expect(resolveFolderId(ENV, 'inbox', { fetchImpl })).rejects.toThrow(/Archive/)
    await expect(resolveFolderId(ENV, 'inbox', { fetchImpl })).rejects.toMatchObject({ retryable: false })
  })
})

describe('listMessages and getMessageContent', () => {
  it('reads a bounded window of one folder BY ID', async () => {
    // Zoho's /messages/view rejects folderName outright with
    // `EXTRA_PARAM_FOUND`. Confirmed against a live account, 18 Sep 2026.
    let requestedUrl = ''
    const fetchImpl = mailboxFetch(async (url) => {
      requestedUrl = url
      return json({ data: [{ messageId: '1' }] })
    })

    await listMessages(ENV, { folder: 'sent', limit: 25, sinceMs: 1_700_000_000_000 }, { fetchImpl })

    expect(requestedUrl).toContain('folderId=200')
    expect(requestedUrl).not.toContain('folderName')
    expect(requestedUrl).toContain('limit=25')
    expect(requestedUrl).toContain('receivedTime=1700000000000')
  })

  it('caps an absurd limit', async () => {
    let requestedUrl = ''
    const fetchImpl = mailboxFetch(async (url) => {
      requestedUrl = url
      return json({ data: [] })
    })
    await listMessages(ENV, { folder: 'inbox', limit: 100_000 }, { fetchImpl })
    expect(requestedUrl).toContain('limit=200')
  })

  it('fetches one message body', async () => {
    const fetchImpl = zohoFetch(async () => json({ data: { content: '<p>Hi</p>' } }))
    expect(await getMessageContent(ENV, 'msg-1', { fetchImpl })).toEqual({ content: '<p>Hi</p>' })
  })

  it('counts every HTTP call against the usage budget, including a retry', async () => {
    let attempts = 0
    const onUsage = vi.fn()
    const fetchImpl = mailboxFetch(async () => {
      attempts += 1
      return attempts === 1 ? json({}, 401) : json({ data: [] })
    })

    await listMessages(ENV, { folder: 'inbox' }, { fetchImpl, onUsage })
    expect(onUsage).toHaveBeenCalled()
  })
})

describe('checkConnection', () => {
  it('reports missing configuration without calling out', async () => {
    const result = await checkConnection({}, { fetchImpl: vi.fn() })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('zoho_not_configured')
  })

  it('reports a healthy connection', async () => {
    const result = await checkConnection(ENV, { fetchImpl: zohoFetch(async () => json({ data: {} })) })
    expect(result.ok).toBe(true)
  })

  it('reports a failure without leaking credentials', async () => {
    const result = await checkConnection(ENV, {
      fetchImpl: zohoFetch(async () => json({ message: 'bad token 1000.abcdefghijklmnopqrstuvwxyz0123' }, 401)),
    })
    expect(result.ok).toBe(false)
    expect(result.detail).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })
})

describe('buildZohoUrl', () => {
  it('links to the folder rather than an undocumented per-message path', () => {
    expect(buildZohoUrl({ folder: 'drafts' })).toContain('Drafts')
    expect(buildZohoUrl({ folder: 'sent' })).toContain('Sent')
  })
})

describe('normalize', () => {
  it('parses epoch milliseconds, epoch seconds and formatted dates', () => {
    expect(parseZohoTimestamp('1700000000000')).toBe('2023-11-14T22:13:20.000Z')
    expect(parseZohoTimestamp(1_700_000_000)).toBe('2023-11-14T22:13:20.000Z')
    expect(parseZohoTimestamp('2023-11-14T22:13:20Z')).toBe('2023-11-14T22:13:20.000Z')
  })

  it('returns null rather than writing "Invalid Date" into the database', () => {
    expect(parseZohoTimestamp('not a date')).toBeNull()
    expect(parseZohoTimestamp('')).toBeNull()
    expect(parseZohoTimestamp(null)).toBeNull()
  })

  it('splits address lists without breaking on a comma inside a display name', () => {
    expect(parseAddressList('"Doe, Jane" <jane@acme.com>, info@acme.com')).toEqual([
      'jane@acme.com',
      'info@acme.com',
    ])
  })

  it('extracts a display name', () => {
    expect(parseDisplayName('Jane Doe <jane@acme.com>')).toBe('Jane Doe')
    expect(parseDisplayName('jane@acme.com')).toBeNull()
  })

  it('strips HTML from a body', () => {
    expect(extractPlainBody('<p>Hello</p><p>World</p>').text).toBe('Hello\nWorld')
    expect(extractPlainBody('<p>Hello<br>there</p>').text).toBe('Hello\nthere')
    expect(extractPlainBody('<p>A &amp; B &lt;c&gt;</p>').text).toBe('A & B <c>')
  })

  it('strips quoted reply history', () => {
    const body = 'Thanks, that works.\n\nOn Tue, 3 Sep 2026 at 10:00, Stephen wrote:\n> our earlier email'
    expect(stripQuotedHistory(body)).toBe('Thanks, that works.')
  })

  it('keeps the original when stripping would leave nothing', () => {
    const body = '> just a quoted line'
    expect(stripQuotedHistory(body)).toBe(body)
  })

  it('maps a sent-folder entry to an outbound message', () => {
    const message = normalizeZohoMessage(
      {
        messageId: 'm-1',
        threadId: 't-1',
        fromAddress: 'Stephen <stephen@devlabstudios.com>',
        toAddress: 'hello@acme.com',
        subject: 'Your intake process',
        sentDateInGMT: '1700000000000',
      },
      'sent',
    )

    expect(message).toMatchObject({
      direction: 'outbound',
      providerMessageId: 'm-1',
      providerThreadId: 't-1',
      fromAddress: 'stephen@devlabstudios.com',
      fromName: 'Stephen',
      toAddresses: ['hello@acme.com'],
    })
    expect(message.sentAt).toBeTruthy()
    expect(message.receivedAt).toBeNull()
  })

  it('maps an inbox entry to an inbound message', () => {
    const message = normalizeZohoMessage(
      { messageId: 'm-2', fromAddress: 'hello@acme.com', receivedTime: '1700000000000' },
      'inbox',
    )
    expect(message.direction).toBe('inbound')
    expect(message.receivedAt).toBeTruthy()
  })
})

describe('threadMatch', () => {
  const mailbox = 'stephen@devlabstudios.com'

  function lookups(overrides = {}) {
    return {
      findConversationByThreadId: async () => null,
      findConversationByMessageIds: async () => null,
      findContactsByEmail: async () => [],
      findConversationForLead: async () => null,
      ...overrides,
    }
  }

  it('parses a References header', () => {
    expect(parseMessageIdList('<a@x> <b@y>,\n <c@z>')).toEqual(['<a@x>', '<b@y>', '<c@z>'])
    expect(parseMessageIdList(null)).toEqual([])
  })

  it('normalizes a Message-ID consistently', () => {
    expect(normalizeMessageId('<abc@acme.com>')).toBe('<abc@acme.com>')
    expect(normalizeMessageId('abc@acme.com')).toBe('<abc@acme.com>')
    expect(normalizeMessageId('garbage')).toBeNull()
  })

  it('picks the counterpart address, never our own', () => {
    expect(
      counterpartAddresses({ direction: 'outbound', toAddresses: ['hello@acme.com', mailbox] }, mailbox),
    ).toEqual(['hello@acme.com'])

    expect(counterpartAddresses({ direction: 'inbound', fromAddress: 'hello@acme.com' }, mailbox)).toEqual([
      'hello@acme.com',
    ])
  })

  it('prefers the provider thread id', async () => {
    const result = await matchMessageToConversation({
      message: { direction: 'inbound', providerThreadId: 't-1', fromAddress: 'hello@acme.com' },
      mailboxAddress: mailbox,
      ...lookups({
        findConversationByThreadId: async () => ({ id: 'c-1', leadId: 'l-1', contactId: 'ct-1' }),
      }),
    })

    expect(result).toMatchObject({ matched: true, leadId: 'l-1', strategy: 'provider_thread_id' })
  })

  it('falls back to In-Reply-To and References', async () => {
    const seen = []
    const result = await matchMessageToConversation({
      message: {
        direction: 'inbound',
        inReplyTo: '<sent-1@devlabstudios.com>',
        references: '<older@devlabstudios.com>',
        fromAddress: 'hello@acme.com',
      },
      mailboxAddress: mailbox,
      ...lookups({
        findConversationByMessageIds: async (ids) => {
          seen.push(...ids)
          return { id: 'c-1', leadId: 'l-1' }
        },
      }),
    })

    expect(result.strategy).toBe('message_id_headers')
    expect(seen).toContain('<sent-1@devlabstudios.com>')
    expect(seen).toContain('<older@devlabstudios.com>')
  })

  it('matches a manually composed sent message by recipient address', async () => {
    const result = await matchMessageToConversation({
      message: { direction: 'outbound', toAddresses: ['hello@acme.com'], timestamp: '2026-09-18T00:00:00Z' },
      mailboxAddress: mailbox,
      ...lookups({
        findContactsByEmail: async () => [{ id: 'ct-1', leadId: 'l-1' }],
        findConversationForLead: async () => ({ id: 'c-1', leadId: 'l-1', lastMessageAt: '2026-09-17T00:00:00Z' }),
      }),
    })

    expect(result).toMatchObject({ matched: true, leadId: 'l-1', contactId: 'ct-1', strategy: 'contact_address' })
  })

  it('flags a contact match against a long-silent conversation as stale', async () => {
    const result = await matchMessageToConversation({
      message: { direction: 'inbound', fromAddress: 'hello@acme.com', timestamp: '2026-09-18T00:00:00Z' },
      mailboxAddress: mailbox,
      ...lookups({
        findContactsByEmail: async () => [{ id: 'ct-1', leadId: 'l-1' }],
        findConversationForLead: async () => ({ id: 'c-1', leadId: 'l-1', lastMessageAt: '2025-01-01T00:00:00Z' }),
      }),
    })

    expect(result.strategy).toBe('contact_address_stale')
  })

  it('leaves unrelated mail alone', async () => {
    const result = await matchMessageToConversation({
      message: { direction: 'inbound', fromAddress: 'newsletter@somewhere.com', subject: 'Re: Quick question' },
      mailboxAddress: mailbox,
      ...lookups(),
    })

    expect(result.matched).toBe(false)
    expect(result.leadId).toBeNull()
  })

  it('never matches on subject alone', async () => {
    // Two prospects replying with the same subject must not collide.
    const result = await matchMessageToConversation({
      message: { direction: 'inbound', fromAddress: 'someone@elsewhere.com', subject: 'Re: Your intake process' },
      mailboxAddress: mailbox,
      ...lookups({ findContactsByEmail: async () => [] }),
    })
    expect(result.matched).toBe(false)
  })

  it('does not treat a missing timestamp as stale', () => {
    expect(withinTimeProximity(null, '2026-01-01T00:00:00Z')).toBe(true)
    expect(withinTimeProximity('2026-01-01T00:00:00Z', null)).toBe(true)
    expect(withinTimeProximity('2026-01-01T00:00:00Z', '2026-01-10T00:00:00Z')).toBe(true)
    expect(withinTimeProximity('2026-01-01T00:00:00Z', '2025-01-01T00:00:00Z')).toBe(false)
  })
})
