import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { buttonClass, formatDate, inputClass, primaryButtonClass, relativeTime } from '../lead-crm/format'
import { EmptyState, Feedback, Panel } from '../lead-crm/shared'
import { useResource } from '../lead-crm/useResource'
import MessageBody from './MessageBody'

/**
 * hello@devlabconnect.com, inside the CMS.
 *
 * Built from the Lead CRM's own components and Tailwind idioms so this reads as
 * another section of this admin rather than a mail client someone bolted on.
 *
 * ONE THING THIS SCREEN HAS TO BE HONEST ABOUT: pressing Reply does not send.
 * It queues a message for the external sender, which transmits it on its next
 * run. Every other mail client in the world sends on Reply, so saying nothing
 * would be actively misleading — the button text and the confirmation both say
 * "queue".
 */

const AUTH_TONES = {
  pass: 'text-emerald-700',
  fail: 'text-rose-700',
  softfail: 'text-amber-700',
  neutral: 'text-slate-500',
  none: 'text-slate-500',
}

function AuthResults({ auth }) {
  if (!auth || (!auth.spf && !auth.dkim && !auth.dmarc)) return null

  return (
    <span className="flex flex-wrap gap-2 text-xs">
      {['spf', 'dkim', 'dmarc'].map((mechanism) =>
        auth[mechanism] ? (
          <span key={mechanism} className={AUTH_TONES[auth[mechanism]] ?? 'text-slate-500'}>
            {mechanism.toUpperCase()} {auth[mechanism]}
          </span>
        ) : null,
      )}
    </span>
  )
}

function Attachments({ attachments }) {
  if (!attachments || attachments.length === 0) return null

  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {attachment.r2Key ? (
            <a
              href={`/api/admin/mailbox/attachments/${attachment.id}`}
              // Downloads only — the route serves everything with an attachment
              // disposition and a re-derived content type, never inline.
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
            >
              {attachment.filename}
              <span className="text-slate-400">{Math.max(1, Math.round(attachment.size / 1024))} KB</span>
            </a>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800"
              title={attachment.skippedReason ?? ''}
            >
              {attachment.filename} — not stored
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function ReplyBox({ threadId, parentMessageId, onDone }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (!body.trim()) return

    setBusy(true)
    setFeedback(null)
    try {
      await adminApi.post(`/api/admin/mailbox/threads/${threadId}/reply`, {
        bodyText: body,
        inReplyToMessageId: parentMessageId ?? null,
      })
      setBody('')
      setFeedback({ tone: 'ok', message: 'Queued. The external sender transmits it on its next run — not yet sent.' })
      onDone?.()
    } catch (error) {
      setFeedback({ tone: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-slate-200 pt-3">
      <label className="block text-xs font-semibold text-slate-600" htmlFor={`reply-${threadId}`}>
        Reply as hello@devlabconnect.com
      </label>
      <textarea
        id={`reply-${threadId}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={6}
        className={`${inputClass} w-full font-sans`}
        placeholder="Write your reply…"
      />
      <Feedback feedback={feedback} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy || !body.trim()} className={primaryButtonClass}>
          {busy ? 'Queueing…' : 'Queue reply'}
        </button>
        <p className="text-xs text-slate-500">
          Queued, not sent. Threading headers and the bounce return path are set here.
        </p>
      </div>
    </form>
  )
}

function Thread({ threadId, onChanged }) {
  const { data, state, reload } = useResource(threadId ? `/api/admin/mailbox/threads/${threadId}` : null, {
    skip: !threadId,
  })
  const [busy, setBusy] = useState(false)

  if (!threadId) return <EmptyState title="Select a conversation." />
  if (state === 'loading') return <p className="text-sm text-slate-500">Loading…</p>
  if (state === 'error') return <p className="text-sm text-rose-600">This conversation could not be loaded.</p>
  if (!data) return null

  async function setState(next) {
    setBusy(true)
    try {
      await adminApi.post(`/api/admin/mailbox/threads/${threadId}/state`, next)
      reload()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  const { thread, messages, outbound } = data
  const pending = (outbound ?? []).filter((item) => item.status === 'queued' || item.status === 'collected')
  const failed = (outbound ?? []).filter((item) => item.status === 'failed')
  const lastInbound = [...messages].reverse().find((message) => message.direction === 'inbound')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{thread.subject || '(no subject)'}</h3>
          <p className="text-xs text-slate-500">
            {thread.correspondent}
            {thread.companyName ? ` · ${thread.companyName}` : ''} · {messages.length} message
            {messages.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setState({ read: true })} className={buttonClass}>
            Mark read
          </button>
          <button type="button" disabled={busy} onClick={() => setState({ read: false })} className={buttonClass}>
            Unread
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setState({ state: thread.state === 'archived' ? 'inbox' : 'archived' })}
            className={buttonClass}
          >
            {thread.state === 'archived' ? 'Move to inbox' : 'Archive'}
          </button>
        </div>
      </div>

      {thread.leadId ? (
        <p className="text-xs text-slate-500">
          Linked to a lead —{' '}
          <a className="font-semibold underline" href={`/admin/lead-crm/leads?lead=${thread.leadId}`}>
            open in Lead CRM
          </a>
          . This message also appears in the CRM&apos;s Conversations and Replies queue.
        </p>
      ) : null}

      {failed.length > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {failed.length} repl{failed.length === 1 ? 'y' : 'ies'} could not be transmitted.{' '}
          {failed[0].error ? <span className="text-xs">Last error: {failed[0].error}</span> : null}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pending.length} repl{pending.length === 1 ? 'y is' : 'ies are'} waiting for the external sender.
        </div>
      ) : null}

      <ul className="space-y-3">
        {messages.map((message) => {
          const inbound = message.direction === 'inbound'
          return (
            <li
              key={message.id}
              className={`rounded-lg border p-3 ${inbound ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  {inbound ? message.fromAddress : 'hello@devlabconnect.com'}
                </span>
                <span className="text-xs text-slate-400">{formatDate(message.receivedAt || message.sentAt)}</span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-slate-800">{message.subject || '(no subject)'}</p>
                <AuthResults auth={message.auth} />
              </div>

              {message.isDsn && message.dsn ? (
                <div className="my-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-800">
                  Delivery failure for {message.dsn.recipient ?? 'a recipient'} — status {message.dsn.status ?? '—'} (
                  {message.dsn.action ?? 'unknown action'}).
                  {message.dsn.diagnostic ? <span className="block">{message.dsn.diagnostic}</span> : null}
                  {message.correlationMethod === 'verp' || message.correlationMethod === 'message_id' ? (
                    <span className="block text-rose-600">
                      Matched by {message.correlationMethod === 'verp' ? 'return path' : 'message ID'} — an
                      identifier we issued, so this report is trustworthy.
                    </span>
                  ) : message.correlationMethod === 'address' ? (
                    // A delivery report cannot be authenticated: it comes from an
                    // arbitrary MTA with no envelope sender to check. Matching on
                    // the address alone means trusting a line the sender wrote,
                    // so it is shown as what it is rather than acted on.
                    <span className="block text-rose-600">
                      Matched by recipient address only, which any sender can assert — recorded, but nothing was
                      suppressed. If this is genuine, suppress the address on the{' '}
                      <a className="underline" href="/admin/lead-crm/suppression">
                        Suppression screen
                      </a>
                      .
                    </span>
                  ) : (
                    <span className="block text-rose-600">
                      Not matched to an outreach draft, so nothing was suppressed.
                    </span>
                  )}
                </div>
              ) : null}

              {message.parseStatus !== 'ok' ? (
                <p className="my-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                  This message was stored but not fully read ({message.parseStatus}).
                  {message.parseError ? ` ${message.parseError}` : ''} The original is still available below.
                </p>
              ) : null}

              <div className="mt-2">
                <MessageBody message={message} />
              </div>

              <Attachments attachments={message.attachments} />

              {message.rawKey ? (
                <a
                  href={`/api/admin/mailbox/messages/${message.id}/raw`}
                  className="mt-2 inline-block text-xs text-slate-500 underline"
                >
                  Download original (.eml)
                </a>
              ) : null}
            </li>
          )
        })}
      </ul>

      <ReplyBox
        threadId={thread.id}
        parentMessageId={lastInbound?.id ?? null}
        onDone={() => {
          reload()
          // The list shows message counts and last-activity time, so it is
          // stale too — every other mutation on this screen refreshes both.
          onChanged?.()
        }}
      />
    </div>
  )
}

function InboxPage() {
  const [mailbox, setMailbox] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  // Typing must not fire a request per keystroke — the query behind this is a
  // LIKE over mailbox_threads. Same 300ms debounce the Leads screen uses, for
  // the same reason.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const query = new URLSearchParams()
  if (mailbox) query.set('mailbox', mailbox)
  if (search) query.set('search', search)
  if (unreadOnly) query.set('unread', 'true')

  const { data, state, reload } = useResource(`/api/admin/mailbox/threads?${query.toString()}`)
  const threads = data?.threads ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mailbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            hello@devlabconnect.com. Received through Cloudflare, stored here. Replies are queued for the external
            sender — nothing is transmitted from this application.
          </p>
        </div>
        <a className="text-sm font-semibold text-slate-600 underline" href="/admin/mailbox/diagnostics">
          Diagnostics
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mailbox}
          onChange={(event) => setMailbox(event.target.value)}
          aria-label="Mailbox"
          className={inputClass}
        >
          <option value="">Inbox (people)</option>
          <option value="hello">hello@</option>
          <option value="postmaster">postmaster@</option>
          <option value="abuse">abuse@</option>
          <option value="other">Unrouted</option>
          <option value="bounce">Bounces</option>
          <option value="dmarc">DMARC reports</option>
        </select>

        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search sender or subject"
          aria-label="Search"
          className={`${inputClass} min-w-[220px]`}
        />

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          Unread only
        </label>
      </div>

      {state === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {state === 'error' ? <p className="text-sm text-rose-600">The mailbox could not be loaded.</p> : null}
      {state === 'ready' && threads.length === 0 ? (
        <EmptyState
          title="Nothing here yet."
          hint="Mail arrives once Cloudflare Email Routing points hello@devlabconnect.com at this Worker."
        />
      ) : null}

      {threads.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(thread.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === thread.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${thread.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}
                    >
                      {thread.correspondentName || thread.correspondent || '(unknown sender)'}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{relativeTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-600">{thread.subject || '(no subject)'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                    {thread.unreadCount > 0 ? ` · ${thread.unreadCount} unread` : ''}
                    {thread.companyName ? ` · ${thread.companyName}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <Panel>
            <Thread threadId={selectedId} onChanged={reload} />
          </Panel>
        </div>
      ) : null}
    </div>
  )
}

export default InboxPage
