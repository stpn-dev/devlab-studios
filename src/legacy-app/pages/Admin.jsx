import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Refine } from '@refinedev/core'
import simpleRestProvider from '@refinedev/simple-rest'
import ProjectsManager from '../../components/admin/ProjectsManager'
import ContentManager from '../../components/admin/ContentManager'
import SiteSettingsManager from '../../components/admin/SiteSettingsManager'
import SeoManager from '../../components/admin/SeoManager'
import { LogOut, ShieldCheck, User } from '../../components/icons/icons'
import devlabStudiosLogo from '../../assets/devlabstudios-logo-only.png'
import { brandingAssets } from '../../config/branding'

const sections = [
  {
    id: 'projects',
    label: 'Projects',
    title: 'Project Manager',
    subtitle: 'Manage portfolio projects from D1 and store public media in R2.',
  },
  {
    id: 'services',
    label: 'Services',
    title: 'Services CMS',
    subtitle: 'Manage solution categories, process steps, and service FAQ content.',
  },
  {
    id: 'resources',
    label: 'Resources',
    title: 'Resources CMS',
    subtitle: 'Manage feed posts, readable guides, and readiness playbook content.',
  },
  {
    id: 'profile',
    label: 'Profile',
    title: 'Profile CMS',
    subtitle: 'Manage founder profile, experience, skills, and system capability content.',
  },
  {
    id: 'site-settings',
    label: 'Site Settings',
    title: 'Site Settings CMS',
    subtitle: 'Manage navigation, CTA labels, footer copy, quick links, and social links.',
  },
  {
    id: 'seo',
    label: 'SEO',
    title: 'SEO CMS',
    subtitle: 'Manage page titles, descriptions, canonical links, and social metadata.',
  },
]

function AdminLogin({ onLogin }) {
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
    <div className="min-h-screen bg-brand-shell px-4 py-10 text-brand-ink">
      <Helmet>
        <title>Admin Login - DevLab Studios CMS</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-20 h-64 w-64 rounded-full bg-brand-teal/10 blur-[140px]" />
        <div className="absolute right-1/4 top-48 h-80 w-80 rounded-full bg-brand-orange/10 blur-[160px]" />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <form onSubmit={handleSubmit} className="relative w-full rounded-2xl border border-brand-teal/15 bg-white/95 p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)]">
          <div className="flex items-center gap-3">
            <img
              src={brandingAssets.logoOnlyUrl}
              alt="DevLab Studios"
              className="h-12 w-12 rounded-md object-contain"
              width="48"
              height="48"
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = devlabStudiosLogo
              }}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">CMS Admin</p>
              <h1 className="mt-1 text-2xl font-semibold text-brand-ink">Sign in</h1>
            </div>
          </div>

          <label className="mt-6 block text-sm font-semibold text-brand-ink" htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-md border border-brand-teal/20 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-mint"
            required
          />

          <label className="mt-4 block text-sm font-semibold text-brand-ink" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-md border border-brand-teal/20 px-3 py-2 text-sm outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-mint"
            required
          />

          {status ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {status}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-md bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Admin() {
  const [activeSection, setActiveSection] = useState('projects')
  const [session, setSession] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const section = sections.find((item) => item.id === activeSection) || sections[0]

  useEffect(() => {
    let isMounted = true

    async function checkSession() {
      try {
        const response = await fetch('/api/admin/session', { credentials: 'include' })
        if (!isMounted) return

        if (response.ok) {
          setSession(await response.json())
        } else {
          setSession(null)
        }
      } catch {
        if (isMounted) setSession(null)
      } finally {
        if (isMounted) setIsCheckingSession(false)
      }
    }

    checkSession()

    return () => {
      isMounted = false
    }
  }, [])

  async function handleLogout() {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})

    setSession(null)
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-shell text-sm font-semibold text-brand-teal">
        Loading admin session...
      </div>
    )
  }

  if (!session) {
    return <AdminLogin onLogin={setSession} />
  }

  return (
    <Refine dataProvider={simpleRestProvider('/api/admin')} resources={[{ name: 'projects' }]}>
      <Helmet>
        <title>Admin - DevLab Studios CMS</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="min-h-screen bg-brand-shell text-brand-ink">
        <div className="border-b border-brand-teal/10 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-start gap-3">
              <img
                src={brandingAssets.logoOnlyUrl}
                alt="DevLab Studios"
                className="mt-1 h-12 w-12 shrink-0 rounded-md object-contain"
                width="48"
                height="48"
                onError={(event) => {
                  event.currentTarget.onerror = null
                  event.currentTarget.src = devlabStudiosLogo
                }}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">CMS Admin</p>
                <h1 className="mt-1 text-2xl font-semibold leading-tight text-brand-ink">{section.title}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{section.subtitle}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-brand-teal/15 bg-white px-4 py-3 shadow-sm shadow-brand-teal/5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-mint text-brand-teal ring-1 ring-brand-teal/15">
                  <User size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-ink">{session.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <ShieldCheck size={13} aria-hidden="true" />
                      Signed in
                    </span>
                    <span className="rounded-full bg-brand-mint px-2 py-0.5 font-semibold text-brand-teal ring-1 ring-brand-teal/15">
                      {session.role || 'admin'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-brand-teal/20 bg-white px-3 py-2 text-sm font-semibold text-brand-teal transition hover:border-brand-teal/35 hover:bg-brand-mint sm:shrink-0"
              >
                <LogOut size={16} aria-hidden="true" />
                Log out
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    activeSection === item.id
                      ? 'bg-brand-teal text-white'
                      : 'border border-brand-teal/20 bg-white text-brand-ink hover:bg-brand-mint'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          {activeSection === 'projects' ? <ProjectsManager /> : null}
          {['services', 'resources', 'profile'].includes(activeSection) ? <ContentManager contentType={activeSection} /> : null}
          {activeSection === 'site-settings' ? <SiteSettingsManager /> : null}
          {activeSection === 'seo' ? <SeoManager /> : null}
        </div>
      </div>
    </Refine>
  )
}

export default Admin
