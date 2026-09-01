import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

const ROLES = ['ADMIN', 'SESSION_FACILITATOR', 'SCOREKEEPER']
const EMPTY_FORM = { invitedEmail: '', role: 'SESSION_FACILITATOR' }

export default function OperatorsPage() {
  const { activeOrgId } = useOutletContext()
  const [memberships, setMemberships] = useState([])
  const [status, setStatus] = useState('loading')
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState(null)
  const [fetchKey, setFetchKey] = useState(null)

  if (fetchKey !== activeOrgId) {
    setFetchKey(activeOrgId)
    setMemberships([])
    setStatus('loading')
    setMessage(null)
  }

  useEffect(() => {
    let ignore = false
    pickleballApi
      .get(`/api/pickleball/organizations/${activeOrgId}/memberships`)
      .then((data) => {
        if (!ignore) {
          setMemberships(data.memberships)
          setStatus('ready')
        }
      })
      .catch(() => !ignore && setStatus('error'))
    return () => {
      ignore = true
    }
  }, [activeOrgId])

  async function handleInvite() {
    setMessage(null)
    try {
      const { membership } = await pickleballApi.post(`/api/pickleball/organizations/${activeOrgId}/memberships`, form)
      setMemberships((current) => [...current.filter((m) => m.id !== membership.id), membership])
      setForm(EMPTY_FORM)
      setMessage({ type: 'success', text: 'Invitation saved.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  async function handleRevoke(membership) {
    setMessage(null)
    try {
      await pickleballApi.delete(`/api/pickleball/organizations/${activeOrgId}/memberships/${membership.id}`)
      setMemberships((current) => current.map((m) => (m.id === membership.id ? { ...m, status: 'REVOKED' } : m)))
      setMessage({ type: 'success', text: 'Operator access revoked.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Operators</h1>
        <div className="pb-rule mt-1.5 h-[3px] w-11 rounded-full" />
      </div>

      {status === 'loading' ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {status === 'error' ? <p className="text-sm text-rose-600">Could not load operators.</p> : null}
      {message ? <p className={message.type === 'success' ? 'text-sm text-emerald-700' : 'text-sm text-rose-600'}>{message.text}</p> : null}

      <div className="space-y-2" data-testid="operators-list">
        {memberships.map((membership) => (
          <div key={membership.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <div>
              <span className="font-semibold text-slate-900">{membership.invitedEmail}</span>
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{membership.role}</span>
              {membership.status === 'REVOKED' ? (
                <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">Revoked</span>
              ) : null}
            </div>
            {membership.status === 'ACTIVE' ? (
              <button
                type="button"
                onClick={() => handleRevoke(membership)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-rose-600 hover:border-rose-300"
              >
                Revoke
              </button>
            ) : null}
          </div>
        ))}
        {!memberships.length && status === 'ready' ? <p className="text-sm text-slate-500">No operators yet.</p> : null}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Invite an operator</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={form.invitedEmail}
            onChange={(event) => setForm({ ...form, invitedEmail: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Role</span>
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={handleInvite}
          disabled={!form.invitedEmail.trim()}
          className="pb-btn-primary rounded-lg px-4 py-2 text-sm"
        >
          Invite
        </button>
        <p className="text-xs text-slate-400">Inviting an email that already has access updates their role instead of creating a duplicate.</p>
      </div>
    </div>
  )
}
