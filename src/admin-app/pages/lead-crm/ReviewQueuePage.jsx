import { useState } from 'react'
import LeadDetail from './LeadDetail'
import { PRIORITY_TONES, humanize, relativeTime } from './format'
import { Badge, EmptyState } from './shared'
import { useResource } from './useResource'

/**
 * The review queue.
 *
 * Leads that are rule-qualified, AI-qualified, contactable, compliance-clear
 * and have a draft written — everything the engine can do, done. What remains
 * is a person reading it.
 *
 * Ordered by score rather than by age. The queue is meant to be worked from the
 * top and abandoned partway through without that being a problem; ordering by
 * age would mean the best lead of the week sits behind forty mediocre ones.
 */

function ReviewQueuePage() {
  const { data, state, reload } = useResource(
    '/api/admin/lead-crm/leads?stages=READY_FOR_REVIEW&stages=READY_TO_CONTACT&sort=score&limit=100',
  )
  const [selectedId, setSelectedId] = useState(null)

  const leads = data?.leads ?? []
  const selected = selectedId ?? leads[0]?.id ?? null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Review queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Qualified, contactable and drafted. Read the opportunity, edit the message, then create the Zoho draft and send
          it yourself.
        </p>
      </div>

      {state === 'loading' ? <p className="text-sm text-slate-500">Loading the queue…</p> : null}
      {state === 'error' ? <p className="text-sm text-rose-600">The queue could not be loaded.</p> : null}

      {state === 'ready' && leads.length === 0 ? (
        <EmptyState
          title="Nothing waiting for review."
          hint="Leads arrive here once they are scored, AI-qualified, contactable and drafted."
        />
      ) : null}

      {leads.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul className="space-y-2">
            {leads.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selected === lead.id ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{lead.companyName}</span>
                    <span className="text-sm font-semibold text-slate-900">{lead.ruleScore ?? '—'}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{lead.canonicalDomain}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge value={lead.priority} tones={PRIORITY_TONES} />
                    {lead.opportunityType ? (
                      <span className="text-xs text-slate-500">{humanize(lead.opportunityType)}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{relativeTime(lead.lastActivityAt)}</p>
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <LeadDetail leadId={selected} onChanged={reload} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default ReviewQueuePage
