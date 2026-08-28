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
      </div>
    </div>
  )
}
