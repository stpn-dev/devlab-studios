import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { inputClass, relativeTime } from '../lead-crm/format'
import { EmptyState, Panel } from '../lead-crm/shared'
import { useResource } from '../lead-crm/useResource'
import { FOLDERS, MACHINE_MAILBOXES, folderFor } from './folders'
import OutboundList from './OutboundList'
import ThreadView from './ThreadView'

/**
 * hello@devlabconnect.com, as a mail client.
 *
 * Folders are the familiar ones — Inbox, Drafts, Outbox, Sent, Failed, Archive
 * — because replies to leads are answered here alongside everything else, and a
 * bespoke vocabulary would make people learn a mailbox they already know how to
 * use. Each maps onto a real distinction in the data rather than being a label
 * over the same list; see folders.js.
 *
 * THE OUTBOX/SENT SPLIT IS LOAD-BEARING. The thing that transmits mail is a
 * separate system that may not have run, so a reply sits in Outbox until it
 * calls back and only then moves to Sent. Every other mail client collapses
 * these; here that would tell the operator a prospect had been answered when
 * nothing had left the building.
 *
 * Built from the Lead CRM's own components and Tailwind idioms, so this reads
 * as another section of this admin rather than an app bolted on beside it.
 */

function FolderRail({ current, counts }) {
  const unreadInbox = Object.entries(counts ?? {})
    .filter(([mailbox]) => mailbox === 'hello' || mailbox === 'other' || mailbox === 'postmaster' || mailbox === 'abuse')
    .reduce((sum, [, entry]) => sum + (entry.unread ?? 0), 0)

  return (
    <nav aria-label="Mailbox folders" className="space-y-1">
      {FOLDERS.map((folder) => {
        const active = folder.key === current
        const badge = folder.key === 'inbox' && unreadInbox > 0 ? unreadInbox : null

        return (
          <a
            key={folder.key}
            href={`/admin/mailbox/${folder.key}`}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
              active ? 'bg-slate-900 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>{folder.label}</span>
            {badge ? (
              <span
                className={`rounded-full px-2 text-xs font-semibold ${active ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
              >
                {badge}
              </span>
            ) : null}
          </a>
        )
      })}

      <p className="px-3 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Machine mail</p>
      {MACHINE_MAILBOXES.map((mailbox) => (
        <a
          key={mailbox.key}
          href={`/admin/mailbox/inbox?mailbox=${mailbox.key}`}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
        >
          <span>{mailbox.label}</span>
          {counts?.[mailbox.key]?.unread ? (
            <span className="rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-700">
              {counts[mailbox.key].unread}
            </span>
          ) : null}
        </a>
      ))}

      <a
        href="/admin/mailbox/diagnostics"
        className="mt-2 flex rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
      >
        Diagnostics
      </a>
    </nav>
  )
}

function ThreadList({ threads, selectedId, onSelect, folder }) {
  if (threads.length === 0) {
    return (
      <EmptyState
        title={folder.key === 'inbox' ? 'Nothing here yet.' : `Nothing in ${folder.label}.`}
        hint={
          folder.key === 'inbox'
            ? 'Mail arrives once an Email Routing rule points hello@devlabconnect.com at this Worker.'
            : folder.hint
        }
      />
    )
  }

  return (
    <ul className="space-y-2">
      {threads.map((thread) => (
        <li key={thread.id}>
          <button
            type="button"
            onClick={() => onSelect(thread.id)}
            className={`w-full rounded-xl border p-3 text-left transition ${
              selectedId === thread.id
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`truncate text-sm ${thread.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}
              >
                {thread.correspondentName || thread.correspondent || '(unknown sender)'}
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {relativeTime(folder.key === 'sent' ? thread.lastOutboundAt : thread.lastMessageAt)}
              </span>
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
  )
}

function MailboxPage() {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const folder = folderFor(params.folder ?? 'inbox')

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [selectedId, setSelectedId] = useState(searchParams.get('thread'))

  const mailbox = searchParams.get('mailbox') ?? ''

  // Typing must not fire a request per keystroke — the query behind this is a
  // LIKE over mailbox_threads. Same 300ms debounce the Leads screen uses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const query = new URLSearchParams()
  if (mailbox) query.set('mailbox', mailbox)
  if (search && folder.kind === 'threads') query.set('search', search)

  const { data, state, reload } = useResource(`/api/admin/mailbox/folders/${folder.key}?${query.toString()}`)

  const threads = data?.threads ?? []
  const messages = data?.messages ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mailbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            hello@devlabconnect.com. Received through Cloudflare, stored here, answered here — including replies from
            leads.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <FolderRail current={folder.key} counts={data?.counts} />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{folder.hint}</p>
            {folder.kind === 'threads' ? (
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search sender or subject"
                aria-label="Search"
                className={`${inputClass} min-w-[220px]`}
              />
            ) : null}
          </div>

          {mailbox ? (
            <p className="text-xs text-slate-500">
              Filtered to {mailbox}.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.delete('mailbox')
                  setSearchParams(next)
                }}
              >
                Clear
              </button>
            </p>
          ) : null}

          {state === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {state === 'error' ? <p className="text-sm text-rose-600">This folder could not be loaded.</p> : null}

          {state === 'ready' && folder.kind === 'messages' ? (
            <OutboundList folder={folder.key} messages={messages} onChanged={reload} />
          ) : null}

          {state === 'ready' && folder.kind === 'threads' ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <ThreadList
                threads={threads}
                selectedId={selectedId}
                onSelect={setSelectedId}
                folder={folder}
              />
              {threads.length > 0 ? (
                <Panel>
                  <ThreadView threadId={selectedId} onChanged={reload} />
                </Panel>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default MailboxPage
