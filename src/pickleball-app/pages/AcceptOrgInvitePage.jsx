import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { pickleballApi } from '../lib/pickleballApi'

export default function AcceptOrgInvitePage() {
  const { token } = useParams()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [message, setMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage(null)
    setIsSubmitting(true)
    try {
      await pickleballApi.post(`/api/pickleball/auth/org-invites/${token}/accept`, { name, slug })
      window.location.href = '/pickleball/app'
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'linear-gradient(180deg, var(--devlab-dark-950) 0%, var(--devlab-dark-900) 60%, var(--devlab-dark-850) 100%)' }}>
      <div className="pb-scoreboard w-full max-w-sm p-8">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-white">Create your club</h1>
        <div className="pb-rule mb-5 h-[3px] w-11 rounded-full" />
        <p className="mb-6 text-sm text-slate-300">You've been invited to start your own Devlab Pickleball club. Name it below.</p>
        {message ? <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{message.text}</p> : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-300">Club name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-300">Slug (lowercase, hyphens)</span>
            <input type="text" value={slug} onChange={(event) => setSlug(event.target.value)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <button type="submit" disabled={isSubmitting || !name.trim() || !slug.trim()} className="pb-btn-primary w-full rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">
            {isSubmitting ? 'Creating…' : 'Create club'}
          </button>
        </form>
      </div>
    </div>
  )
}
