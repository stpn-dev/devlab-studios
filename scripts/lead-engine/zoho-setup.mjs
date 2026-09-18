#!/usr/bin/env node
/**
 * Zoho Mail one-time setup helper.
 *
 * The refresh token has to be obtained out of band, by a human, once — the
 * application only ever implements the refresh half of the flow (see
 * src/lead-engine/zoho/oauth.js). This script is that out-of-band step, done
 * without hand-crafting curl commands that put a client secret into shell
 * history.
 *
 * NOTHING IS WRITTEN TO DISK. The refresh token is printed once, to your
 * terminal, because you need it for `wrangler secret put`. It is never saved,
 * never logged to a file, and never sent anywhere except Zoho.
 *
 * Credentials are read from the environment rather than from arguments, because
 * arguments appear in shell history and in the process list.
 *
 *   PowerShell:
 *     $env:ZOHO_OAUTH_CLIENT_ID     = "1000.XXXX"
 *     $env:ZOHO_OAUTH_CLIENT_SECRET = "yyyy"
 *
 *   bash/zsh:
 *     export ZOHO_OAUTH_CLIENT_ID=1000.XXXX
 *     export ZOHO_OAUTH_CLIENT_SECRET=yyyy
 *
 * Then:
 *
 *   node scripts/lead-engine/zoho-setup.mjs auth-url
 *   node scripts/lead-engine/zoho-setup.mjs exchange <CODE>
 *   node scripts/lead-engine/zoho-setup.mjs verify          (needs the refresh token too)
 *
 * Region: pass --region=eu|in|au|jp|ca|sa for a non-.com data centre. Mixing
 * regions produces `invalid_client`, which looks exactly like a wrong secret.
 */

const REGIONS = {
  com: { accounts: 'https://accounts.zoho.com', mail: 'https://mail.zoho.com/api' },
  eu: { accounts: 'https://accounts.zoho.eu', mail: 'https://mail.zoho.eu/api' },
  in: { accounts: 'https://accounts.zoho.in', mail: 'https://mail.zoho.in/api' },
  au: { accounts: 'https://accounts.zoho.com.au', mail: 'https://mail.zoho.com.au/api' },
  jp: { accounts: 'https://accounts.zoho.jp', mail: 'https://mail.zoho.jp/api' },
  ca: { accounts: 'https://accounts.zohocloud.ca', mail: 'https://mail.zohocloud.ca/api' },
  sa: { accounts: 'https://accounts.zoho.sa', mail: 'https://mail.zoho.sa/api' },
}

/**
 * The narrowest scope set this engine can work with.
 *
 * `ZohoMail.messages.ALL` also carries SEND permission at Zoho's end — Zoho
 * offers no create-draft-but-not-send scope. The guarantee that nothing is ever
 * sent lives in src/lead-engine/zoho/client.js, which has no send function, not
 * in the scope. Worth knowing so nobody assumes the scope is the control.
 */
const SCOPES = ['ZohoMail.messages.ALL', 'ZohoMail.accounts.READ', 'ZohoMail.folders.READ']

const DEFAULT_REDIRECT = 'https://www.devlabstudios.com/oauth/zoho/callback'

const args = process.argv.slice(2)
const command = args.find((arg) => !arg.startsWith('--')) || 'help'
const positional = args.filter((arg) => !arg.startsWith('--')).slice(1)

function flag(name, fallback = null) {
  const match = args.find((arg) => arg.startsWith(`--${name}=`))
  return match ? match.slice(name.length + 3) : fallback
}

let detectedRegionKey = flag('region', 'com')
if (!REGIONS[detectedRegionKey]) {
  console.error(`Unknown region. Use one of: ${Object.keys(REGIONS).join(', ')}`)
  process.exit(1)
}

/**
 * Resolved through a call rather than captured once, because the callback URL
 * carries the data centre and can correct the default after this point.
 */
const region = () => REGIONS[detectedRegionKey]

const redirectUri = flag('redirect', DEFAULT_REDIRECT)
const clientId = (process.env.ZOHO_OAUTH_CLIENT_ID || '').trim()
const clientSecret = (process.env.ZOHO_OAUTH_CLIENT_SECRET || '').trim()

function requireCredentials() {
  const missing = []
  if (!clientId) missing.push('ZOHO_OAUTH_CLIENT_ID')
  if (!clientSecret) missing.push('ZOHO_OAUTH_CLIENT_SECRET')

  if (missing.length > 0) {
    console.error(`\nMissing environment variable(s): ${missing.join(', ')}`)
    console.error('Set them in this shell first — see the header of this file.\n')
    process.exit(1)
  }
}

/** Shows enough of a credential to confirm it is the right one, and no more. */
function fingerprint(value) {
  if (!value) return '(not set)'
  return value.length <= 12 ? `${value.slice(0, 4)}…` : `${value.slice(0, 8)}…${value.slice(-4)}`
}

function heading(text) {
  console.log(`\n${text}`)
  console.log('─'.repeat(Math.min(72, text.length + 8)))
}

// ---------------------------------------------------------------------------

function authUrl() {
  requireCredentials()

  const url = new URL(`${region().accounts}/oauth/v2/auth`)
  url.searchParams.set('scope', SCOPES.join(','))
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  // Without access_type=offline Zoho issues an access token and NO refresh
  // token, and the whole exercise has to be repeated.
  url.searchParams.set('access_type', 'offline')
  // Forces the consent screen even on a repeat run, which is what makes a
  // refresh token reliably come back the second time.
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('redirect_uri', redirectUri)

  heading('1. Open this URL while signed in as the mailbox owner')
  console.log(`\n${url.toString()}\n`)

  heading('2. Approve, then read the address bar')
  console.log(`
Your browser will land on a 404 page. That is expected — this application has
no OAuth callback route, deliberately (the refresh token is obtained once, by
hand, and the app only ever refreshes it).

The URL will look like:

  ${redirectUri}?code=1000.abc123...&location=us&accounts-server=...

The code expires in about 60 SECONDS. Do not bother extracting it — paste the
WHOLE URL, in quotes. The data centre is read from it too.`)

  heading('3. Exchange it — have this ready BEFORE you approve')
  console.log(`
  node scripts/lead-engine/zoho-setup.mjs exchange "<paste the whole URL>"
`)
}

/**
 * Accepts either the bare code or the whole callback URL.
 *
 * The code expires in about sixty seconds, and asking someone to extract one
 * query parameter by hand inside that window is how a setup attempt gets
 * burned. Copying the entire address bar is the natural thing to do under time
 * pressure, so that works.
 *
 * @param {string|undefined} value
 * @returns {string|null}
 */
function readCode(value) {
  const raw = String(value ?? '').trim().replace(/^["']|["']$/g, '')
  if (!raw) return null
  if (!raw.includes('?') && !raw.includes('=')) return raw

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://example.invalid/?${raw.replace(/^[?]/, '')}`)

    // The callback carries the data centre too. Reading it beats making someone
    // remember a --region flag: a region mismatch otherwise surfaces as
    // `invalid_client`, which reads exactly like a wrong secret.
    const server = url.searchParams.get('accounts-server')
    if (server && !args.some((arg) => arg.startsWith('--region='))) {
      const matched = Object.entries(REGIONS).find(([, urls]) => server.startsWith(urls.accounts))
      if (matched && matched[0] !== detectedRegionKey) {
        detectedRegionKey = matched[0]
        console.log(`
Using the ${matched[0]} data centre, read from the callback URL.`)
      }
    }

    return url.searchParams.get('code')
  } catch {
    return raw
  }
}

async function exchange() {
  requireCredentials()

  const code = readCode(positional[0])
  if (!code) {
    console.error('\nUsage: node scripts/lead-engine/zoho-setup.mjs exchange <CODE or the whole callback URL>\n')
    process.exit(1)
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  })

  const response = await fetch(`${region().accounts}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const payload = await response.json().catch(() => null)

  // Zoho answers 200 with an `error` field for several failures, so the status
  // alone does not tell you whether this worked.
  if (!payload?.access_token) {
    heading('Zoho refused the exchange')
    console.error(`\nerror: ${payload?.error || `HTTP ${response.status}`}\n`)
    console.error(explainTokenError(payload?.error))
    process.exit(1)
  }

  if (!payload.refresh_token) {
    heading('Got an access token but NO refresh token')
    console.error(`
That means access_type=offline was missing, or this client has already been
authorized and Zoho did not re-issue one.

Run "auth-url" again — it sets prompt=consent, which forces a fresh refresh
token. If it still does not come back, revoke the app under
Zoho Accounts → Security → OAuth → Connected Apps, then retry.
`)
    process.exit(1)
  }

  const accessToken = payload.access_token

  heading('Refresh token obtained')
  console.log(`
Copy this now. It is shown ONCE and is long-lived — treat it like a password.

  ${payload.refresh_token}
`)

  // Look the account id up with the token we just got, so it is one step
  // instead of a second hand-crafted request.
  heading('Looking up the account id')

  const accountsResponse = await fetch(`${region().mail}/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
  })

  const accountsPayload = await accountsResponse.json().catch(() => null)
  const accounts = Array.isArray(accountsPayload?.data) ? accountsPayload.data : []

  if (accounts.length === 0) {
    console.error(`
Could not read the account list (HTTP ${accountsResponse.status}).

The refresh token above is still valid — keep it. Find the account id manually:

  curl -H "Authorization: Zoho-oauthtoken <ACCESS_TOKEN>" ${region().mail}/accounts
`)
    process.exit(1)
  }

  console.log('')
  for (const account of accounts) {
    console.log(`  accountId : ${account.accountId}`)
    console.log(`  mailbox   : ${account.primaryEmailAddress || account.mailboxAddress || '(unknown)'}`)
    console.log(`  name      : ${account.accountDisplayName || account.displayName || '(unnamed)'}`)
    console.log('')
  }

  const primary = accounts[0]

  heading('Now set the secrets')
  console.log(`
Run each of these and paste the value when prompted. Add --env preview to do
the preview environment instead of production.

  npx wrangler secret put ZOHO_OAUTH_CLIENT_ID
  npx wrangler secret put ZOHO_OAUTH_CLIENT_SECRET
  npx wrangler secret put ZOHO_OAUTH_REFRESH_TOKEN
  npx wrangler secret put ZOHO_ACCOUNT_ID       → ${primary.accountId}
  npx wrangler secret put ZOHO_USER_EMAIL       → ${primary.primaryEmailAddress || '<the mailbox address>'}
${
  detectedRegionKey === 'com'
    ? ''
    : `  npx wrangler secret put ZOHO_ACCOUNTS_BASE_URL → ${region().accounts}
  npx wrangler secret put ZOHO_API_BASE_URL     → ${region().mail}
`
}
Then flip the flags in wrangler.jsonc (both environments) when you are ready:

  "ZOHO_MAIL_ENABLED": "true"
  "ZOHO_MAIL_SYNC_ENABLED": "true"

Nothing polls the mailbox until BOTH those and LEAD_ENGINE_ENABLED are true.

Finally, confirm it works end to end:

  $env:ZOHO_OAUTH_REFRESH_TOKEN = "<the token above>"
  node scripts/lead-engine/zoho-setup.mjs verify
`)
}

async function verify() {
  requireCredentials()

  const refreshToken = (process.env.ZOHO_OAUTH_REFRESH_TOKEN || '').trim()
  if (!refreshToken) {
    console.error('\nSet ZOHO_OAUTH_REFRESH_TOKEN in this shell first.\n')
    process.exit(1)
  }

  heading('Configuration')
  console.log(`
  region        : ${detectedRegionKey}
  accounts URL  : ${region().accounts}
  mail API URL  : ${region().mail}
  client id     : ${fingerprint(clientId)}
  client secret : ${fingerprint(clientSecret)}
  refresh token : ${fingerprint(refreshToken)}
`)

  heading('Refreshing the access token')

  const tokenResponse = await fetch(`${region().accounts}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const tokenPayload = await tokenResponse.json().catch(() => null)

  if (!tokenPayload?.access_token) {
    console.error(`\n  FAILED — ${tokenPayload?.error || `HTTP ${tokenResponse.status}`}\n`)
    console.error(explainTokenError(tokenPayload?.error))
    process.exit(1)
  }

  console.log(`  OK — access token valid for ${tokenPayload.expires_in || '?'} seconds`)
  const accessToken = tokenPayload.access_token

  /** Each check is the exact call a part of the engine makes. */
  const checks = [
    ['accounts', `${region().mail}/accounts`, 'the settings-screen connectivity probe'],
  ]

  const accountId = (process.env.ZOHO_ACCOUNT_ID || '').trim()

  if (accountId) {
    checks.push([`account ${accountId}`, `${region().mail}/accounts/${accountId}`, 'checkConnection()'])

    // Resolve folder ids the same way resolveFolderId() in
    // src/lead-engine/zoho/client.js does — by folderType FIRST, because Zoho
    // localises display names. `/messages/view` rejects folderName outright
    // with EXTRA_PARAM_FOUND, confirmed against a live account.
    const folderResponse = await fetch(`${region().mail}/accounts/${accountId}/folders`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
    })
    const folderPayload = await folderResponse.json().catch(() => null)
    const folders = (Array.isArray(folderPayload?.data) ? folderPayload.data : []).map((folder) => ({
      id: String(folder.folderId ?? folder.FolderID ?? ''),
      name: String(folder.folderName ?? folder.FolderName ?? ''),
      type: String(folder.folderType ?? folder.FolderType ?? ''),
      path: String(folder.path ?? folder.Path ?? ''),
    }))

    heading(`Folders (${folders.length})`)
    console.log('')
    console.log(`  ${'id'.padEnd(22)} ${'name'.padEnd(26)} ${'type'.padEnd(14)} path`)
    for (const folder of folders) {
      console.log(`  ${folder.id.padEnd(22)} ${folder.name.padEnd(26)} ${folder.type.padEnd(14)} ${folder.path}`)
    }
    console.log('')

    // Mirrors resolveFolderId() in src/lead-engine/zoho/client.js. A sub-folder
    // INHERITS its parent's type, so a real mailbox has several folders typed
    // `Inbox` and the type alone cannot identify the canonical one.
    const findFolder = (wanted) => {
      const candidates = folders.filter((folder) => folder.type.toLowerCase() === wanted)
      const topLevel = (folder) => folder.path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).length === 1

      if (candidates.length > 1) {
        console.log(
          `  ${candidates.length} folders are typed "${wanted}": ${candidates.map((f) => f.name).join(', ')} — ` +
            'resolving by name, then by hierarchy.',
        )
      }

      return (
        candidates.find((folder) => folder.name.toLowerCase() === wanted)?.id ||
        candidates.find(topLevel)?.id ||
        (candidates.length === 1 ? candidates[0].id : null) ||
        folders.find((folder) => folder.name.toLowerCase() === wanted)?.id ||
        null
      )
    }

    for (const [wanted, label, why] of [
      ['inbox', 'inbox view', 'mailbox sync (Inbox)'],
      ['sent', 'sent view', 'mailbox sync (Sent) — this is what detects a manual send'],
    ]) {
      const folderId = findFolder(wanted)

      if (!folderId) {
        console.log(`  Could not resolve the ${wanted} folder from the list above — skipping that check.`)
        continue
      }

      checks.push([
        label,
        `${region().mail}/accounts/${accountId}/messages/view?folderId=${folderId}&limit=1`,
        why,
      ])
    }
  }

  heading('Checking the endpoints the engine actually calls')
  console.log('')

  let failures = 0
  for (const [label, url, why] of checks) {
    const response = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
    })
    const ok = response.ok
    if (!ok) failures += 1

    console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(24)} ${why}`)
    if (!ok) {
      const detail = await response.text().catch(() => '')
      console.log(`        HTTP ${response.status} ${detail.slice(0, 200)}`)
    }
  }

  if (!accountId) {
    console.log(`
  ZOHO_ACCOUNT_ID is not set in this shell, so the per-account and folder
  checks were skipped. Set it and re-run to exercise the mailbox-sync calls.`)
  }

  console.log('')
  if (failures > 0) {
    heading(`${failures} check(s) failed`)
    console.log(`
The folder list above is what the engine resolves against. If a view call
failed while its folder id resolved fine, this account expects a different
parameter on /messages/view — tell me the error body and it is a one-function
change in src/lead-engine/zoho/client.js.
`)
    process.exit(1)
  }

  heading('All checks passed')
  console.log(`
Zoho is reachable and the engine's calls work against this account.

Note what was NOT tested: creating a draft. That writes to your Drafts folder,
so it is left for you to do deliberately from the Lead CRM once a lead reaches
READY_TO_CONTACT. It cannot send — see src/lead-engine/zoho/client.js.
`)
}

function explainTokenError(error) {
  switch (error) {
    case 'invalid_code':
      return 'The code was already used or expired (~60s). Run auth-url again and be quicker.'
    case 'invalid_client':
      return `Usually one of:
  - wrong data centre — the client lives in a different Zoho region than you are
    calling (re-run with --region=eu|in|au|jp|ca|sa)
  - client id and secret are from different clients
  - the secret was truncated on copy`
    case 'invalid_redirect_uri':
      return `The redirect_uri must match the Authorized Redirect URI on the client
EXACTLY, including scheme and any trailing slash. This script uses:
  ${redirectUri}
Pass --redirect=<uri> if yours differs.`
    case 'invalid_grant':
      return 'The refresh token has been revoked or is from a different client. Obtain a new one.'
    default:
      return 'Check the client id, secret and region, then try again.'
  }
}

function help() {
  console.log(`
Zoho Mail setup helper for the Lead Intelligence Engine.

  node scripts/lead-engine/zoho-setup.mjs auth-url
      Prints the authorization URL to open, and what to do with the result.

  node scripts/lead-engine/zoho-setup.mjs exchange <CODE>
      Exchanges the one-time code for a refresh token, looks up the account id,
      and prints the exact secrets to set.

  node scripts/lead-engine/zoho-setup.mjs verify
      Refreshes a token and calls the endpoints the engine actually uses.

Options:
  --region=com|eu|in|au|jp|ca|sa   Zoho data centre (default: com)
  --redirect=<uri>                 Override the redirect URI

Credentials come from the environment, never from arguments:
  ZOHO_OAUTH_CLIENT_ID, ZOHO_OAUTH_CLIENT_SECRET
  ZOHO_OAUTH_REFRESH_TOKEN, ZOHO_ACCOUNT_ID  (verify only)

Full walkthrough: docs/lead-engine/zoho-integration.md
`)
}

const commands = { 'auth-url': authUrl, exchange, verify, help }
const run = commands[command] || help

try {
  await run()
} catch (error) {
  console.error(`\nUnexpected failure: ${error instanceof Error ? error.message : error}\n`)
  process.exit(1)
}
