import { useState } from 'react'
import { brandingAssets } from '../../config/branding'
import devlabStudiosLogo from '../../assets/devlabstudios-logo-only.png'

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setStatus(data.error || 'Unable to sign in.')
        return
      }

      onLogin(data)
    } catch {
      setStatus('Unable to reach the admin login API.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <form onSubmit={handleSubmit} className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <img
              src={brandingAssets.logoOnlyUrl}
              alt="DevLab Studios"
              className="h-12 w-12 rounded-md object-contain"
              width="48"
              height="48"
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = devlabStudiosLogo.src
              }}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">CMS Admin</p>
              <h1 className="mt-1 text-2xl font-semibold">Sign in</h1>
            </div>
          </div>

          <label className="mt-6 block text-sm font-semibold" htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal"
            required
          />

          <label className="mt-4 block text-sm font-semibold" htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal"
            required
          />

          {status ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{status}</div> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-md bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
