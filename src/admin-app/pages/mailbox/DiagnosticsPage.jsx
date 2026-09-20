import { formatDate, relativeTime } from '../lead-crm/format'
import { EmptyState, Panel } from '../lead-crm/shared'
import { useResource } from '../lead-crm/useResource'

/**
 * The three mailbox failures that are invisible from the inbox.
 *
 * Every one of these keeps the inbox looking healthy while something is
 * actually wrong, which is the failure mode this codebase has been bitten by
 * repeatedly:
 *
 *   1. R2 not configured — mail still arrives and is still stored, but the
 *      originals are not, so a message the parser could not read has nothing
 *      behind it. Invisible until someone tries to open one.
 *   2. A queue that never drains — replies are written and never transmitted.
 *      The thread shows a reply; the recipient never got it.
 *   3. Messages that did not parse — the parser met something it does not
 *      handle. Each one is readable as a raw original, and a growing list is
 *      the signal to look at why.
 */

function Stat({ label, value, tone = 'text-slate-900', hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function DiagnosticsPage() {
  const { data, state } = useResource('/api/admin/mailbox/diagnostics')

  if (state === 'loading') return <p className="text-sm text-slate-500">Loading…</p>
  if (state === 'error') return <p className="text-sm text-rose-600">Diagnostics could not be loaded.</p>
  if (!data) return null

  const { storage, outbound, awaitingTransmission, unparsed, bounces, dmarc, unread, humanMailboxes } = data

  // Counted over the mailboxes a person actually reads. Summing every mailbox
  // would fold in DMARC aggregates and bounces — machine mail that nothing
  // marks read — and the headline would climb forever while the human inbox
  // sat empty.
  const human = new Set(humanMailboxes ?? [])
  const countFor = (predicate) =>
    Object.entries(unread ?? {}).reduce(
      (sum, [mailbox, entry]) => (predicate(mailbox) ? sum + (entry.unread ?? 0) : sum),
      0,
    )
  const totalUnread = countFor((mailbox) => human.has(mailbox))
  const machineUnread = countFor((mailbox) => !human.has(mailbox))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mailbox diagnostics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Operational state of hello@devlabconnect.com.
        </p>
      </div>

      {!storage.rawStorageConfigured ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">Original messages are not being stored.</p>
          <p className="mt-1 text-xs text-rose-800">
            The <code>MAILBOX_BUCKET</code> R2 binding is missing. Mail still arrives and its parsed fields are saved,
            but the raw original and every attachment are discarded — so a message that cannot be parsed cannot be
            recovered. Create the bucket and add the binding.
          </p>
        </div>
      ) : null}

      {!storage.senderConfigured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">No external sender is configured.</p>
          <p className="mt-1 text-xs text-amber-800">
            <code>MAILBOX_OUTBOX_TOKEN</code> is unset, so the outbox endpoints refuse every request and queued replies
            will never be collected. You can still read mail.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Unread"
          value={totalUnread}
          hint={machineUnread > 0 ? `Plus ${machineUnread} unread in bounces and DMARC reports.` : 'People only.'}
        />
        <Stat
          label="Awaiting transmission"
          value={awaitingTransmission ?? 0}
          tone={awaitingTransmission > 0 ? 'text-amber-700' : 'text-slate-900'}
          hint="Queued or collected but not confirmed sent."
        />
        <Stat
          label="Failed replies"
          value={outbound?.failed ?? 0}
          tone={(outbound?.failed ?? 0) > 0 ? 'text-rose-700' : 'text-slate-900'}
        />
        <Stat
          label="Unparsed messages"
          value={unparsed?.length ?? 0}
          tone={(unparsed?.length ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900'}
          hint="Stored, but not fully readable."
        />
      </div>

      <Panel
        title="Messages that could not be parsed"
        description="Each one is stored in full. Download the original to see what arrived."
      >
        {(unparsed ?? []).length === 0 ? (
          <EmptyState title="Every message so far parsed cleanly." />
        ) : (
          <ul className="space-y-2">
            {unparsed.map((message) => (
              <li key={message.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{message.fromAddress || '(no sender)'}</span>
                  <span className="text-xs text-slate-500">{formatDate(message.receivedAt)}</span>
                </div>
                <p className="text-xs text-slate-600">{message.subject || '(no subject)'}</p>
                <p className="mt-1 text-xs text-amber-900">
                  {message.parseStatus}
                  {message.parseError ? ` — ${message.parseError}` : ''} · {Math.round(message.rawSize / 1024)} KB
                </p>
                {message.rawKey ? (
                  <a
                    href={`/api/admin/mailbox/messages/${message.id}/raw`}
                    className="text-xs text-slate-600 underline"
                  >
                    Download original
                  </a>
                ) : (
                  <span className="text-xs text-rose-700">No original was stored.</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent bounces" description="Delivery failures. Hard bounces suppress the address in the CRM.">
          {(bounces ?? []).length === 0 ? (
            <EmptyState title="No bounces recorded." />
          ) : (
            <ul className="space-y-2">
              {bounces.map((thread) => (
                <li key={thread.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-800">{thread.correspondent}</span>
                    <span className="text-xs text-slate-400">{relativeTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{thread.subject}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="DMARC reports"
          description="Aggregate XML from receiving providers. Kept out of the inbox on purpose — they arrive daily and would bury real mail."
        >
          {(dmarc ?? []).length === 0 ? (
            <EmptyState
              title="No reports yet."
              hint="They start arriving a day after rua= is added to the DMARC record."
            />
          ) : (
            <ul className="space-y-2">
              {dmarc.map((thread) => (
                <li key={thread.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-slate-800">{thread.correspondent}</span>
                    <span className="text-xs text-slate-400">{relativeTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{thread.subject}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

export default DiagnosticsPage
