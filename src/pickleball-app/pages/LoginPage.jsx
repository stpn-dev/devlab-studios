import { useState } from 'react'

// Every failure branch of /api/pickleball/auth/google/callback redirects here
// (the SPA mount point) with an ?error= code. Keep this map in sync with that
// route — an unmapped code renders the generic fallback rather than nothing.
const ERROR_MESSAGES = {
  no_access: 'Your Google account has no active Pickleball membership. Ask an admin to invite you.',
  email_not_verified:
    'Your Google account email is not verified. Verify it with Google, then try signing in again.',
  oauth_failed: 'Google sign-in could not be completed. Please try again.',
  too_many_attempts: 'Too many sign-in attempts. Please wait a few minutes and try again.',
}

const FALLBACK_ERROR_MESSAGE = 'Sign-in could not be completed. Please try again.'

// TEMPORARY (2026-08-26): only works when the server has
// PICKLEBALL_TEST_AUTH_ENABLED=true (preview only, never production, and the
// server refuses with 404 either way if it isn't set) -- lets a real person
// sign in on preview without configured Google OAuth. Remove once Google
// OAuth is configured for preview, or once this round of live testing is done.
function TempTestLoginForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await fetch('/api/pickleball/auth/test-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Sign-in failed.')
      }
      window.location.href = '/pickleball/app'
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-2 border-t border-slate-200 pt-4 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Temporary test sign-in</p>
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign in (test)'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  const errorMessage = error ? ERROR_MESSAGES[error] || FALLBACK_ERROR_MESSAGE : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Devlab Pickleball</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in with the Google account your organization invited.</p>
        {errorMessage && (
          <p role="alert" className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
        <a
          href="/api/pickleball/auth/google/start"
          className="inline-flex w-full items-center justify-center rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Sign in with Google
        </a>
        <TempTestLoginForm />
      </div>
    </div>
  )
}
