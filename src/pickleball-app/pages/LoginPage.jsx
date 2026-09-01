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

export default function LoginPage() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')
  const errorMessage = error ? ERROR_MESSAGES[error] || FALLBACK_ERROR_MESSAGE : null

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'linear-gradient(180deg, var(--devlab-dark-950) 0%, var(--devlab-dark-900) 60%, var(--devlab-dark-850) 100%)' }}
    >
      <div className="pb-scoreboard w-full max-w-sm p-8 text-center">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Devlab</p>
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-white">Pickleball</h1>
        <div className="pb-rule mx-auto mb-5 h-[3px] w-11 rounded-full" />
        <p className="mb-6 text-sm text-slate-300">Sign in with the Google account your organization invited.</p>
        {errorMessage && (
          <p role="alert" className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {errorMessage}
          </p>
        )}
        <a
          href="/api/pickleball/auth/google/start"
          className="pb-btn-primary inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
