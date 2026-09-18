/**
 * The Zoho Mail API client.
 *
 * THE DEFINING PROPERTY OF THIS FILE: it has no send operation.
 *
 * Zoho's message endpoint takes a `mode` parameter, where `draft` saves to the
 * Drafts folder and `sendMail` transmits. `createDraft` below hard-codes
 * `mode: 'draft'` as a literal — it is not a parameter, not a default, and not
 * configurable from any caller. There is no other function here that POSTs a
 * message. That is the architectural guarantee the whole system rests on: a
 * bug, a misconfiguration, or a future caller passing the wrong argument cannot
 * cause an email to be sent, because the code to send one does not exist.
 *
 * If a send capability is ever wanted, it has to be written deliberately — and
 * `assertNoSendMode` below will refuse a payload that tries to smuggle one in.
 */

import { ZOHO } from '../config/defaults.js'
import { getAccessToken, readZohoConfig, redactZohoError, ZohoAuthError } from './oauth.js'

export class ZohoApiError extends Error {
  constructor(message, { status = 502, code = 'zoho_api_error', retryable = true } = {}) {
    super(message)
    this.name = 'ZohoApiError'
    this.status = status
    this.code = code
    this.retryable = retryable
  }
}

/**
 * Refuses any payload that would transmit a message.
 *
 * Belt and braces behind the hard-coded `mode: 'draft'`. Cheap, and it turns a
 * future mistake into a thrown error at the boundary rather than an email to a
 * stranger.
 *
 * @param {Record<string, unknown>} payload
 */
export function assertNoSendMode(payload) {
  const mode = String(payload?.mode ?? '').toLowerCase()
  if (mode && mode !== 'draft') {
    throw new ZohoApiError(
      `Refusing a Zoho message request with mode "${payload.mode}". This system never sends mail.`,
      { status: 500, code: 'zoho_send_refused', retryable: false },
    )
  }
  if ('scheduleType' in (payload || {}) || 'scheduleTime' in (payload || {})) {
    throw new ZohoApiError('Refusing a scheduled Zoho message. This system never sends mail.', {
      status: 500,
      code: 'zoho_send_refused',
      retryable: false,
    })
  }
}

/**
 * One authenticated request against the Zoho Mail API.
 *
 * Retries ONCE on a 401 with a forced token refresh, because an access token
 * that expired between the cache check and the request is the single most
 * common transient failure here and is fixed by exactly that.
 *
 * @param {Env} env
 * @param {string} path relative to the API base, beginning with `/`
 * @param {{ method?: string, body?: unknown, query?: Record<string, unknown>,
 *           fetchImpl?: typeof fetch, onUsage?: () => void|Promise<void> }} [options]
 */
async function zohoRequest(env, path, options = {}) {
  const config = readZohoConfig(env)
  const fetchImpl = options.fetchImpl || fetch

  const url = new URL(`${config.apiBaseUrl}${path}`)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }

  const send = async (accessToken) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ZOHO.requestTimeoutMs)
    try {
      return await fetchImpl(url.toString(), {
        method: options.method || 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      })
    } catch (error) {
      throw new ZohoApiError(
        controller.signal.aborted ? 'Zoho request timed out.' : `Zoho request failed: ${redactZohoError(error instanceof Error ? error.message : '')}`,
        { code: 'zoho_network_error', retryable: true },
      )
    } finally {
      clearTimeout(timer)
    }
  }

  let accessToken = await getAccessToken(env, { fetchImpl: options.fetchImpl })
  let response = await send(accessToken)

  if (response.status === 401) {
    accessToken = await getAccessToken(env, { fetchImpl: options.fetchImpl, force: true })
    response = await send(accessToken)
  }

  // Usage accounting happens per HTTP call, including a retried one — the
  // budget is about load on Zoho, not about logical operations.
  if (options.onUsage) await options.onUsage()

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = redactZohoError(payload?.data?.errorCode || payload?.data?.moreInfo || payload?.message || `HTTP ${response.status}`)
    throw new ZohoApiError(`Zoho API error: ${detail}`, {
      status: response.status,
      code: `zoho_http_${response.status}`,
      // 4xx other than 429 means the request itself is wrong; retrying it just
      // repeats the same mistake against someone else's API.
      retryable: response.status === 429 || response.status >= 500,
    })
  }

  return payload
}

/**
 * Saves a message to the Zoho Drafts folder.
 *
 * IT DOES NOT SEND. `mode: 'draft'` is a literal below and the payload is
 * checked before it leaves. The human opens Zoho, reviews the draft and clicks
 * Send themselves.
 *
 * @param {Env} env
 * @param {{ to: string, subject: string, bodyText: string, cc?: string,
 *           inReplyTo?: string|null, references?: string|null }} message
 * @param {{ fetchImpl?: typeof fetch, onUsage?: Function }} [options]
 * @returns {Promise<{ draftId: string|null, messageId: string|null, raw: unknown }>}
 */
export async function createDraft(env, message, options = {}) {
  const config = readZohoConfig(env)
  if (!config.isConfigured) {
    throw new ZohoAuthError(`Zoho is not fully configured. Missing: ${config.missing.join(', ')}.`, {
      status: 503,
      code: 'zoho_not_configured',
    })
  }

  const payload = {
    fromAddress: config.userEmail,
    toAddress: message.to,
    ...(message.cc ? { ccAddress: message.cc } : {}),
    subject: message.subject,
    content: message.bodyText,
    // Plain text. The drafts this system produces are short, personal-looking
    // business emails; HTML would add nothing and would make the "what will
    // actually be sent" question harder for the person reviewing it.
    mailFormat: 'plaintext',
    // THE GUARANTEE. A literal, never a variable.
    mode: 'draft',
    ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
    ...(message.references ? { references: message.references } : {}),
  }

  assertNoSendMode(payload)

  const result = await zohoRequest(env, `/accounts/${config.accountId}/messages`, {
    method: 'POST',
    body: payload,
    fetchImpl: options.fetchImpl,
    onUsage: options.onUsage,
  })

  const data = result?.data || {}
  return {
    draftId: data.draftId ?? data.messageId ?? null,
    messageId: data.messageId ?? null,
    raw: data,
  }
}

/**
 * Per-isolate folder id cache, keyed by `accountId:folder`.
 *
 * Folder ids are stable for the life of a mailbox, so looking them up once per
 * isolate is right. Same reasoning as the access-token cache in oauth.js: a
 * Worker isolate is short-lived and single-tenant, so the worst case is a
 * redundant lookup.
 *
 * @type {Map<string, string>}
 */
const folderIdCache = new Map()

/**
 * Lists the account's folders.
 *
 * @param {Env} env
 * @param {{ fetchImpl?: typeof fetch, onUsage?: Function }} [options]
 * @returns {Promise<Array<{ folderId: string, folderName: string, folderType: string, path: string }>>}
 */
export async function listFolders(env, options = {}) {
  const config = readZohoConfig(env)

  const result = await zohoRequest(env, `/accounts/${config.accountId}/folders`, {
    fetchImpl: options.fetchImpl,
    onUsage: options.onUsage,
  })

  const folders = Array.isArray(result?.data) ? result.data : []

  // Zoho has used both camelCase and capitalised field names across API
  // versions. Reading both is the difference between a working integration and
  // one that reports an empty mailbox.
  return folders.map((folder) => ({
    folderId: String(folder.folderId ?? folder.FolderID ?? folder.folder_id ?? ''),
    folderName: String(folder.folderName ?? folder.FolderName ?? folder.folder_name ?? ''),
    folderType: String(folder.folderType ?? folder.FolderType ?? ''),
    path: String(folder.path ?? folder.Path ?? ''),
  }))
}

/**
 * Resolves 'inbox' / 'sent' to this account's folder id.
 *
 * The `/messages/view` endpoint rejects `folderName` outright —
 * `EXTRA_PARAM_FOUND: folderName Extra paramters given` — and wants `folderId`,
 * which differs per mailbox. Resolving it at runtime rather than making it
 * configuration means one less thing to set per environment, and one less thing
 * to get wrong when a second mailbox is ever connected.
 *
 * MATCHED BY `folderType` FIRST, deliberately. Zoho localises folder DISPLAY
 * names, so a mailbox whose interface language is not English has no folder
 * called "Inbox" — but its type is still `Inbox`. Name and path are fallbacks
 * for older API responses that omit the type.
 *
 * @param {Env} env
 * @param {'inbox'|'sent'} folder
 * @param {{ fetchImpl?: typeof fetch, onUsage?: Function }} [options]
 * @returns {Promise<string>}
 */
export async function resolveFolderId(env, folder, options = {}) {
  const config = readZohoConfig(env)
  const cacheKey = `${config.accountId}:${folder}`

  const cached = folderIdCache.get(cacheKey)
  if (cached) return cached

  const folders = await listFolders(env, options)
  const wanted = folder === 'sent' ? 'sent' : 'inbox'

  // A SUB-FOLDER INHERITS ITS PARENT'S TYPE. A real mailbox has several folders
  // typed `Inbox` — on the account this was first verified against, `Inbox`,
  // `Notification` and `Newsletter` all carry folderType `Inbox`. Taking the
  // first type match would therefore depend on the order Zoho happens to
  // return, and picking `Notification` would make every sync succeed, import
  // nothing, and lose every reply in silence. So the type narrows the
  // candidates and something else decides between them.
  const candidates = folders.filter((entry) => entry.folderType.toLowerCase() === wanted)

  /** Top-level folders have a single path segment: `/Inbox`, not `/Inbox/Newsletter`. */
  const isTopLevel = (entry) => {
    const segments = entry.path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
    return segments.length === 1
  }

  const match =
    // The canonical folder: right type AND the untranslated system name.
    candidates.find((entry) => entry.folderName.toLowerCase() === wanted) ||
    // Otherwise the only top-level folder of that type — which is what
    // identifies the real one in a localised mailbox, where the name is
    // translated but the hierarchy is not.
    candidates.find(isTopLevel) ||
    // A single candidate needs no tie-break.
    (candidates.length === 1 ? candidates[0] : null) ||
    // Last resorts for responses that omit folderType entirely.
    folders.find((entry) => entry.folderName.toLowerCase() === wanted) ||
    folders.find((entry) => entry.path.toLowerCase() === `/${wanted}`)

  if (!match?.folderId) {
    const seen = folders.map((entry) => entry.folderName || entry.folderType).filter(Boolean).join(', ')
    throw new ZohoApiError(
      candidates.length > 1
        ? `Found ${candidates.length} folders typed "${wanted}" on this Zoho account and could not tell which is the real one: ${candidates
            .map((entry) => entry.folderName || entry.folderId)
            .join(', ')}. Refusing to guess.`
        : `Could not find the ${folder} folder on this Zoho account. Found: ${seen || 'nothing'}.`,
      { status: 502, code: 'zoho_folder_not_found', retryable: false },
    )
  }

  folderIdCache.set(cacheKey, match.folderId)
  return match.folderId
}

/** Clears the folder cache. Exported for tests and for a reconnect. */
export function clearFolderCache() {
  folderIdCache.clear()
}

/**
 * Lists messages in a folder.
 *
 * Bounded by `limit` and by a `receivedTime` lower bound, so a sync reads a
 * recent window rather than mirroring the mailbox.
 *
 * @param {Env} env
 * @param {{ folder: 'inbox'|'sent', limit?: number, sinceMs?: number|null, start?: number }} query
 * @param {{ fetchImpl?: typeof fetch, onUsage?: Function }} [options]
 */
export async function listMessages(env, { folder, limit = ZOHO.syncPageSize, sinceMs = null, start = 1 }, options = {}) {
  const config = readZohoConfig(env)
  const folderId = await resolveFolderId(env, folder, options)

  const result = await zohoRequest(env, `/accounts/${config.accountId}/messages/view`, {
    query: {
      folderId,
      limit: Math.min(limit, 200),
      start,
      ...(sinceMs ? { receivedTime: sinceMs } : {}),
    },
    fetchImpl: options.fetchImpl,
    onUsage: options.onUsage,
  })

  const messages = Array.isArray(result?.data) ? result.data : []
  return messages
}

/**
 * Fetches one message's content.
 *
 * Separate from `listMessages` because the list endpoint returns headers only.
 * Called ONLY for messages that already matched a known CRM contact or
 * conversation — the engine does not read the body of unrelated mail.
 *
 * @param {Env} env
 * @param {string} messageId
 * @param {{ folder?: string, fetchImpl?: typeof fetch, onUsage?: Function }} [options]
 */
export async function getMessageContent(env, messageId, options = {}) {
  const config = readZohoConfig(env)

  const result = await zohoRequest(env, `/accounts/${config.accountId}/messages/${encodeURIComponent(messageId)}/content`, {
    fetchImpl: options.fetchImpl,
    onUsage: options.onUsage,
  })

  return result?.data || null
}

/**
 * A deep link to the Zoho Mail web client.
 *
 * Zoho does not document a stable per-message deep-link format, and an
 * undocumented one that silently stops working would send the operator to a
 * blank screen at the moment they are trying to send something. So this returns
 * the folder view plus the information needed to identify the draft, and the UI
 * tells the user which draft to open. See docs/lead-engine/zoho-integration.md.
 *
 * @param {{ folder?: 'drafts'|'inbox'|'sent' }} [options]
 */
export function buildZohoUrl({ folder = 'drafts' } = {}) {
  const folderPath = { drafts: 'Drafts', inbox: 'Inbox', sent: 'Sent' }[folder] || 'Drafts'
  return `https://mail.zoho.com/zm/#mail/folder/${folderPath}`
}

/**
 * A cheap connectivity probe for the integration-status screen.
 *
 * @param {Env} env
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ ok: boolean, detail: string, code?: string }>}
 */
export async function checkConnection(env, options = {}) {
  const config = readZohoConfig(env)
  if (!config.isConfigured) {
    return { ok: false, detail: `Not configured. Missing: ${config.missing.join(', ')}.`, code: 'zoho_not_configured' }
  }

  try {
    await zohoRequest(env, `/accounts/${config.accountId}`, { fetchImpl: options.fetchImpl })
    return { ok: true, detail: 'Connected.' }
  } catch (error) {
    return {
      ok: false,
      detail: redactZohoError(error instanceof Error ? error.message : 'Unknown error.'),
      code: error?.code || 'zoho_api_error',
    }
  }
}
