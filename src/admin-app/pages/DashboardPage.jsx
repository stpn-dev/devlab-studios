import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../lib/adminApi'
import {
  BadgeCheck,
  Briefcase,
  FileText,
  Link2,
  Mail,
  Plus,
  RotateCw,
  Send,
  Trash2,
} from '../../components/icons/icons'
import { PRIMARY_PUBLIC_SURFACES } from '../../config/publicSurfaces'

const STAT_CARDS = [
  { key: 'projects', label: 'Projects', to: '/admin/content/projects', icon: Briefcase },
  { key: 'articles', label: 'Insights', to: '/admin/content/resources', icon: FileText },
  { key: 'certifications', label: 'Certifications', to: '/admin/collections/certifications', icon: BadgeCheck },
  { key: 'redirects', label: 'Redirects', to: '/admin/collections/redirects', icon: Link2 },
  { key: 'leads', label: 'Leads', to: '/admin/leads', icon: Mail },
]

const ACTION_ICONS = {
  create: Plus,
  update: RotateCw,
  replace: RotateCw,
  restore: RotateCw,
  delete: Trash2,
  retry_delivery: Send,
}

function formatRelativeTime(isoString) {
  const then = new Date(isoString).getTime()
  const now = Date.now()
  const diffSeconds = Math.round((now - then) / 1000)

  if (diffSeconds < 60) return 'just now'
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(isoString).toLocaleDateString()
}

async function fetchCount(path, extract) {
  try {
    const data = await adminApi.get(path)
    return extract(data)
  } catch {
    return null
  }
}

function DashboardPage() {
  const [counts, setCounts] = useState({})
  const [recentEvents, setRecentEvents] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let ignore = false

    adminApi.get('/api/admin/audit-log?limit=8')
      .then((data) => !ignore && setRecentEvents(data))
      .catch(() => {})

    Promise.all([
      fetchCount('/api/admin/projects', (data) => data.length),
      fetchCount('/api/admin/content/resources', (data) => data.posts?.length ?? 0),
      fetchCount('/api/admin/collections/certifications', (data) => data.length),
      fetchCount('/api/admin/collections/redirects', (data) => data.length),
      fetchCount('/api/admin/leads', (data) => data.length),
    ]).then(([projects, articles, certifications, redirects, leads]) => {
      if (ignore) return
      setCounts({ projects, articles, certifications, redirects, leads })
      setStatus('ready')
    })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-[#0d1020] px-6 py-5 text-white shadow-md">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute right-16 top-8 h-24 w-24 rounded-full bg-violet-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Content operations</p>
          <h1 className="mt-2 text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-300">An overview of your content, collections, and recent activity.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Public Pages</h2>
            <p className="mt-1 text-sm text-slate-500">Editors follow the same names and order visitors see on the website.</p>
          </div>
          <a href="/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-teal hover:underline">Preview public site</a>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PRIMARY_PUBLIC_SURFACES.map((surface) => {
            const Icon = surface.icon
            return (
              <Link key={surface.key} to={surface.adminPath} className="rounded-xl border border-slate-200 p-4 transition hover:border-violet-300 hover:bg-violet-50/40">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <div>
                    <p className="font-semibold text-slate-900">{surface.label}</p>
                    <p className="text-xs text-slate-500">{surface.publicPath}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">{surface.description}</p>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon
          const count = counts[card.key]
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-teal/30 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-brand-teal">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="text-2xl font-semibold text-slate-900">
                  {status === 'loading' ? (
                    <span className="inline-block h-6 w-6 animate-pulse rounded bg-slate-100" />
                  ) : (
                    count ?? '—'
                  )}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700 group-hover:text-brand-ink">{card.label}</p>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Recent Activity</h2>
          </div>
          {recentEvents.length ? (
            <ul className="divide-y divide-slate-100">
              {recentEvents.map((event) => {
                const ActionIcon = ACTION_ICONS[event.action] || RotateCw
                return (
                  <li key={event.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <ActionIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-brand-teal">{event.entityType} · {event.action.replace('_', ' ')}</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{event.entityId || event.entityType}</p>
                      {event.metadata?.summary ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{event.metadata.summary}</p> : null}
                      {event.actorEmail ? <p className="mt-0.5 truncate text-xs text-slate-400">{event.actorEmail}</p> : null}
                    </div>
                    <span className="flex-shrink-0 text-xs text-slate-400">{formatRelativeTime(event.createdAt)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-500">No activity yet — changes made in the CMS will show up here.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Quick Links</h2>
          <div className="mt-3 divide-y divide-slate-100">
            <Link to="/admin/pages/home" className="flex items-center justify-between py-3 text-sm font-medium text-slate-600 hover:text-brand-teal"><span>Edit homepage</span><span aria-hidden="true">→</span></Link>
            <Link to="/admin/content/site-settings" className="flex items-center justify-between py-3 text-sm font-medium text-slate-600 hover:text-brand-teal"><span>Navigation &amp; Footer</span><span aria-hidden="true">→</span></Link>
            <Link to="/admin/media" className="flex items-center justify-between py-3 text-sm font-medium text-slate-600 hover:text-brand-teal"><span>Media library</span><span aria-hidden="true">→</span></Link>
            <Link to="/admin/audit-log" className="flex items-center justify-between py-3 text-sm font-medium text-slate-600 hover:text-brand-teal"><span>Audit log</span><span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
