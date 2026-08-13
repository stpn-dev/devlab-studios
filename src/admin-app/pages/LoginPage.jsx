import { useEffect, useState } from 'react'
import { brandingAssets } from '../../config/branding'
import devlabStudiosLogo from '../../assets/devlabstudios-logo-only.png'
import siteSettingsContent from '../../data/siteSettingsContent'
import { Code2, Database, FileText, Network } from '../../components/icons/icons'

const CMS_CAPABILITIES = [
  { icon: FileText, label: 'Content', detail: 'Pages, articles, and SEO' },
  { icon: Code2, label: 'Project proof', detail: 'Work, services, and case studies' },
  { icon: Database, label: 'Structured data', detail: 'Collections, media, and settings' },
  { icon: Network, label: 'Operations', detail: 'Leads, redirects, and audit history' },
]

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tagline, setTagline] = useState(siteSettingsContent.footer.tagline)

  useEffect(() => {
    let ignore = false

    fetch('/api/site-settings')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!ignore && data?.footer?.tagline) {
          setTagline(data.footer.tagline)
        }
      })
      .catch(() => {})

    return () => {
      ignore = true
    }
  }, [])

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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-ink via-[#241963] to-[#3320a3] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-brand-teal/20 blur-[120px]" />
          <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-fuchsia-400/15 blur-[140px]" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <img
            src={brandingAssets.logoOnlyUrl}
            alt="DevLab Studios"
            className="h-10 w-10 rounded-md object-contain"
            width="40"
            height="40"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = devlabStudiosLogo.src
            }}
          />
          <span className="text-lg font-semibold tracking-tight">DevLab Studios</span>
        </div>

        <div className="relative z-10 space-y-7">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Content Management System</p>
            <h1 className="max-w-md text-3xl font-semibold leading-tight sm:text-4xl">{tagline}</h1>
            <p className="max-w-lg text-sm leading-6 text-white/65">One quiet workspace for publishing the public experience and keeping every operational handoff current.</p>
          </div>

          <div className="grid max-w-xl grid-cols-2 gap-3" aria-label="CMS capabilities">
            {CMS_CAPABILITIES.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.065] p-4 shadow-[0_16px_34px_rgba(5,8,30,0.16)] backdrop-blur-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-300/10 text-violet-200">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">{label}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/40">{siteSettingsContent.footer.copyright}</p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-4 py-10">
        <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="flex items-center gap-3 lg:hidden">
            <img
              src={brandingAssets.logoOnlyUrl}
              alt="DevLab Studios"
              className="h-10 w-10 rounded-md object-contain"
              width="40"
              height="40"
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = devlabStudiosLogo.src
              }}
            />
            <span className="text-base font-semibold tracking-tight text-brand-ink">DevLab Studios</span>
          </div>

          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal lg:mt-0">CMS Admin</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-ink">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Manage content, projects, and leads.</p>

          <label className="mt-6 block text-sm font-semibold text-slate-800" htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-teal"
            required
          />

          <label className="mt-4 block text-sm font-semibold text-slate-800" htmlFor="admin-password">Password</label>
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
