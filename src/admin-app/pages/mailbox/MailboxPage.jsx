import { useEffect, useState } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  Archive,
  FileText,
  Inbox,
  Mail,
  Menu,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { inputClass, primaryButtonClass, relativeTime } from '../lead-crm/format'
import { EmptyState } from '../lead-crm/shared'
import { useResource } from '../lead-crm/useResource'
import { FOLDERS, MACHINE_MAILBOXES, folderFor } from './folders'
import ComposeDialog from './ComposeDialog'
import OutboundList from './OutboundList'
import ThreadView from './ThreadView'

/**
 * hello@devlabconnect.com, as a mail client.
 *
 * NAVIGATION USES react-router's NavLink, NOT `<a href>`, and that is a
 * correctness fix rather than a style preference. The whole admin is a single
 * `client:only="react"` island (src/pages/admin/[...slug].astro) mounted once,
 * with `createBrowserRouter` inside it. A plain anchor is a FULL DOCUMENT
 * navigation: the browser tears the page down, Astro serves the shell again,
 * the island re-downloads and re-hydrates, AdminApp remounts, its effect
 * re-runs `fetch('/api/admin/session')`, and the router is rebuilt from
 * scratch. That is what the visible flicker was — the white area really was
 * reloading. NavLink swaps the routed element and leaves the CMS shell, this
 * shell and the folder rail mounted, while keeping real URLs, history and
 * back/forward because react-router drives the History API.
 *
 * THE OUTBOX/SENT SPLIT IS LOAD-BEARING. The thing that transmits mail is a
 * separate system that may not have run, so a reply sits in Outbox until it
 * calls back and only then moves to Sent. Every other mail client collapses
 * these because the client is the sender; here that would tell the operator a
 * prospect had been answered when nothing had left the building.
 */

const FOLDER_ICONS = {
  inbox: Inbox,
  drafts: FileText,
  outbox: Send,
  sent: Mail,
  failed: TriangleAlert,
  archived: Archive,
}

const MACHINE_ICONS = { bounce: TriangleAlert, dmarc: ShieldAlert }

function railLinkClass({ isActive }) {
  return `flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
    isActive ? 'bg-slate-900 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'
  }`
}

function FolderRail({ counts, onNavigate }) {
  const humanUnread = ['hello', 'other', 'postmaster', 'abuse'].reduce(
    (sum, mailbox) => sum + (counts?.[mailbox]?.unread ?? 0),
    0,
  )

  return (
    <nav aria-label="Mailbox folders" className="space-y-1">
      {FOLDERS.map((folder) => {
        const Icon = FOLDER_ICONS[folder.key] ?? Mail
        // Counts only where the number means something. A "Sent: 214" badge is
        // noise; unread mail is the one number worth interrupting for.
        const badge = folder.key === 'inbox' && humanUnread > 0 ? humanUnread : null

        return (
          <NavLink
            key={folder.key}
            to={`/admin/mailbox/${folder.key}`}
            className={railLinkClass}
            onClick={onNavigate}
          >
            {({ isActive }) => (
              <>
                <span className="flex items-center gap-2">
                  <Icon size={16} aria-hidden="true" />
                  {folder.label}
                </span>
                {badge ? (
                  <span
                    className={`rounded-full px-2 text-xs font-semibold ${isActive ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'}`}
                  >
                    {badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        )
      })}

      <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Machine mail</p>
      {MACHINE_MAILBOXES.map((mailbox) => {
        const Icon = MACHINE_ICONS[mailbox.key] ?? Mail
        return (
          <NavLink
            key={mailbox.key}
            to={`/admin/mailbox/inbox?mailbox=${mailbox.key}`}
            className={railLinkClass}
            onClick={onNavigate}
          >
            <span className="flex items-center gap-2">
              <Icon size={16} aria-hidden="true" />
              {mailbox.label}
            </span>
            {counts?.[mailbox.key]?.unread ? (
              <span className="rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-700">
                {counts[mailbox.key].unread}
              </span>
            ) : null}
          </NavLink>
        )
      })}

      <NavLink to="/admin/mailbox/diagnostics" className={railLinkClass} onClick={onNavigate}>
        <span className="flex items-center gap-2">
          <Activity size={16} aria-hidden="true" />
          Diagnostics
        </span>
      </NavLink>
    </nav>
  )
}

function ThreadList({ threads, selectedId, onSelect, folder }) {
  if (threads.length === 0) {
    return (
      <div className="px-2 py-6">
        <EmptyState
          title={folder.key === 'inbox' ? 'Nothing here yet.' : `Nothing in ${folder.label}.`}
          hint={
            folder.key === 'inbox'
              ? 'Mail arrives once an Email Routing rule points hello@devlabconnect.com at this Worker.'
              : folder.hint
          }
        />
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-200">
      {threads.map((thread) => {
        const unread = thread.unreadCount > 0
        return (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => onSelect(thread.id)}
              aria-current={selectedId === thread.id ? 'true' : undefined}
              className={`w-full border-l-2 px-3 py-2.5 text-left transition ${
                selectedId === thread.id
                  ? 'border-l-slate-900 bg-slate-50'
                  : 'border-l-transparent hover:bg-slate-50'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-sm ${unread ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                  {thread.correspondentName || thread.correspondent || '(unknown sender)'}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {relativeTime(folder.key === 'sent' ? thread.lastOutboundAt : thread.lastMessageAt)}
                </span>
              </div>
              <p className={`truncate text-sm ${unread ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                {thread.subject || '(no subject)'}
              </p>
              <p className="truncate text-xs text-slate-400">
                {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                {unread ? ` · ${thread.unreadCount} unread` : ''}
                {thread.companyName ? ` · ${thread.companyName}` : ''}
              </p>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function MailboxPage() {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const folder = folderFor(params.folder ?? 'inbox')

  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '')
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [selection, setSelection] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)

  const mailbox = searchParams.get('mailbox') ?? ''

  // Typing must not fire a request per keystroke — the query behind this is a
  // LIKE over mailbox_threads. Same 300ms debounce the Leads screen uses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // The open message is DERIVED from whether the stored selection belongs to
  // the folder currently being shown, rather than being cleared in an effect.
  // Clearing it in an effect triggers a cascading render and the project's lint
  // config rejects it (react-hooks/set-state-in-effect) — the same reasoning as
  // useResource's loading state. Deriving it also makes the wrong thing
  // impossible to render: a thread id from the Inbox is not in the Sent list,
  // and a stale one simply stops matching.
  const linkedThread = searchParams.get('thread')
  const selectedId =
    selection && selection.folder === folder.key && selection.mailbox === mailbox
      ? selection.id
      : linkedThread || null

  const selectThread = (id) => setSelection({ folder: folder.key, mailbox, id })

  const query = new URLSearchParams()
  if (mailbox) query.set('mailbox', mailbox)
  if (search && folder.kind === 'threads') query.set('search', search)

  const { data, state, reload } = useResource(`/api/admin/mailbox/folders/${folder.key}?${query.toString()}`)

  const threads = data?.threads ?? []
  const messages = data?.messages ?? []

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <button
          type="button"
          onClick={() => setRailOpen((open) => !open)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Folders"
          aria-expanded={railOpen}
        >
          <Menu size={18} />
        </button>

        <span className="hidden text-sm font-semibold text-slate-900 sm:inline">hello@devlabconnect.com</span>

        <div className="relative ml-auto flex min-w-[160px] flex-1 items-center sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-2.5 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search mail"
            aria-label="Search mail"
            disabled={folder.kind !== 'threads'}
            className={`${inputClass} w-full pl-8 disabled:bg-slate-50 disabled:text-slate-400`}
          />
        </div>

        <button type="button" onClick={reload} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Refresh">
          <RefreshCw size={16} />
        </button>

        <button type="button" onClick={() => setComposeOpen(true)} className={primaryButtonClass}>
          Compose
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[190px_minmax(0,320px)_minmax(0,1fr)]">
        {/* Mobile/tablet: the rail is a drawer. Desktop: always present. */}
        <aside
          className={`${railOpen ? 'block' : 'hidden'} overflow-y-auto border-b border-slate-200 p-2 lg:block lg:border-b-0 lg:border-r`}
        >
          <FolderRail counts={data?.counts} onNavigate={() => setRailOpen(false)} />
        </aside>

        {/* On narrow screens the list and the reading pane take turns, the way
            a phone mail client does, rather than being squeezed side by side. */}
        <section
          className={`${selectedId ? 'hidden lg:block' : 'block'} min-h-0 overflow-y-auto border-slate-200 lg:border-r ${railOpen ? 'hidden lg:block' : ''}`}
          aria-label={`${folder.label} list`}
        >
          {/* What this folder MEANS, always visible rather than only on an
              empty state. Outbox and Sent look alike at a glance and the
              difference between them — handed over versus confirmed on the
              wire — is the one thing an operator must not have to guess. */}
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">{folder.hint}</p>

          {state === 'loading' ? <p className="p-3 text-sm text-slate-500">Loading…</p> : null}
          {state === 'error' ? <p className="p-3 text-sm text-rose-600">This folder could not be loaded.</p> : null}

          {mailbox ? (
            <p className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
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

          {state === 'ready' && folder.kind === 'messages' ? (
            <div className="p-2">
              <OutboundList folder={folder.key} messages={messages} onChanged={reload} />
            </div>
          ) : null}

          {state === 'ready' && folder.kind === 'threads' ? (
            <ThreadList threads={threads} selectedId={selectedId} onSelect={selectThread} folder={folder} />
          ) : null}
        </section>

        {folder.kind === 'threads' ? (
          <section
            className={`${selectedId ? 'block' : 'hidden lg:block'} min-h-0 overflow-y-auto p-3`}
            aria-label="Reading pane"
          >
            {selectedId ? (
              <button
                type="button"
                onClick={() => selectThread(null)}
                className="mb-2 text-sm text-slate-500 underline lg:hidden"
              >
                ← Back to {folder.label}
              </button>
            ) : null}

            {selectedId ? (
              <ThreadView threadId={selectedId} onChanged={reload} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-slate-400">Select a message to read it.</p>
              </div>
            )}
          </section>
        ) : null}
      </div>

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={() => reload()}
      />
    </div>
  )
}

export default MailboxPage
