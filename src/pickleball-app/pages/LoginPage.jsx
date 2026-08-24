export default function LoginPage() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Devlab Pickleball</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in with the Google account your organization invited.</p>
        {error === 'no_access' && (
          <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            Your Google account has no active Pickleball membership. Ask an admin to invite you.
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
