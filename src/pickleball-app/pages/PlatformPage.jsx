// src/pickleball-app/pages/PlatformPage.jsx
import { useEffect, useState } from 'react'
import { pickleballApi } from '../lib/pickleballApi'

const EMPTY_FORM = { invitedEmail: '', maxAdmins: '', maxFacilitators: '', maxScorekeepers: '' }

function toNullableInt(value) {
  const trimmed = String(value).trim()
  if (!trimmed) return undefined
  return Number(trimmed)
}

export default function PlatformPage() {
  const [organizations, setOrganizations] = useState(null)
  const [invites, setInvites] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState(null)

  async function reload() {
    const [orgsData, invitesData] = await Promise.all([
      pickleballApi.get('/api/pickleball/platform/organizations'),
      pickleballApi.get('/api/pickleball/platform/org-invites'),
    ])
    setOrganizations(orgsData.organizations)
    setInvites(invitesData.invites)
  }

  useEffect(() => {
    reload().catch((error) => setMessage({ type: 'error', text: error.message }))
  }, [])

  async function handleInvite() {
    setMessage(null)
    try {
      const { acceptUrl } = await pickleballApi.post('/api/pickleball/platform/org-invites', {
        invitedEmail: form.invitedEmail,
        maxAdmins: toNullableInt(form.maxAdmins),
        maxFacilitators: toNullableInt(form.maxFacilitators),
        maxScorekeepers: toNullableInt(form.maxScorekeepers),
      })
      setForm(EMPTY_FORM)
      setMessage({ type: 'success', text: `Invite created. Share this link: ${acceptUrl}` })
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleRevoke(inviteId) {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/platform/org-invites/${inviteId}/revoke`, {})
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleSuspend(orgId, suspend) {
    setMessage(null)
    try {
      await pickleballApi.post(`/api/pickleball/platform/organizations/${orgId}/${suspend ? 'suspend' : 'reactivate'}`, {})
      await reload()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Platform</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>

      {message ? (
        <p className={`text-sm ${message.type === 'error' ? 'text-rose-600' : 'text-emerald-700'}`}>{message.text}</p>
      ) : null}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Invite a pilot club</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Email</span>
          <input type="email" value={form.invitedEmail} onChange={(event) => setForm({ ...form, invitedEmail: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Max admins</span>
            <input type="number" min="1" value={form.maxAdmins} onChange={(event) => setForm({ ...form, maxAdmins: event.target.value })} placeholder="Unlimited" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Max facilitators</span>
            <input type="number" min="1" value={form.maxFacilitators} onChange={(event) => setForm({ ...form, maxFacilitators: event.target.value })} placeholder="Unlimited" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Max scorekeepers</span>
            <input type="number" min="1" value={form.maxScorekeepers} onChange={(event) => setForm({ ...form, maxScorekeepers: event.target.value })} placeholder="Unlimited" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <button type="button" onClick={handleInvite} disabled={!form.invitedEmail.trim()} className="pb-btn-primary rounded-lg px-4 py-2 text-sm">Send invite</button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Organizations</h2>
        <div className="space-y-2" data-testid="platform-organizations-list">
          {(organizations || []).map((org) => (
            <div key={org.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div>
                <span className="font-semibold text-slate-900">{org.name}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {org.adminCount}/{org.maxAdmins ?? '∞'} admins · {org.facilitatorCount}/{org.maxFacilitators ?? '∞'} facilitators · {org.scorekeeperCount}/{org.maxScorekeepers ?? '∞'} scorekeepers
                </span>
                {org.status === 'SUSPENDED' ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">Suspended</span> : null}
              </div>
              <button type="button" onClick={() => handleSuspend(org.id, org.status === 'ACTIVE')} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:border-slate-300">
                {org.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Invites</h2>
        <div className="space-y-2" data-testid="platform-invites-list">
          {(invites || []).map((invite) => (
            <div key={invite.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div>
                <span className="font-semibold text-slate-900">{invite.invitedEmail}</span>
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{invite.status}</span>
              </div>
              {invite.status === 'PENDING' ? (
                <button type="button" onClick={() => handleRevoke(invite.id)} className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Revoke</button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
