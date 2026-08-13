import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../lib/adminApi'
import {
  BadgeCheck,
  Briefcase,
  FileText,
  Link2,
  Mail,
  MessageSquare,
  Plus,
  RotateCw,
  Send,
  Settings,
  Trash2,
  ChartColumn,
} from '../../components/icons/icons'

const STAT_CARDS = [
  { key: 'projects', label: 'Projects', to: '/admin/content/projects', icon: Briefcase, iconClass: 'bg-brand-mint text-brand-teal' },
  { key: 'services', label: 'Services', to: '/admin/content/services', icon: Settings, iconClass: 'bg-indigo-50 text-indigo-600' },
  { key: 'articles', label: 'Articles', to: '/admin/content/resources', icon: FileText, iconClass: 'bg-amber-50 text-amber-600' },
  { key: 'caseStudies', label: 'Case Studies', to: '/admin/collections/case-studies', icon: ChartColumn, iconClass: 'bg-sky-50 text-sky-600' },
  { key: 'testimonials', label: 'Testimonials', to: '/admin/collections/testimonials', icon: MessageSquare, iconClass: 'bg-violet-50 text-violet-600' },
  { key: 'certifications', label: 'Certifications', to: '/admin/collections/certifications', icon: BadgeCheck, iconClass: 'bg-emerald-50 text-emerald-600' },
  { key: 'redirects', label: 'Redirects', to: '/admin/collections/redirects', icon: Link2, iconClass: 'bg-rose-50 text-rose-600' },
  { key: 'leads', label: 'Leads', to: '/admin/leads', icon: Mail, iconClass: 'bg-brand-mint text-brand-teal' },
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
      fetchCount('/api/admin/content/services', (data) => data.solutionGroups?.length ?? 0),
      fetchCount('/api/admin/content/resources', (data) => data.posts?.length ?? 0),
      fetchCount('/api/admin/collections/case-studies', (data) => data.length),
      fetchCount('/api/admin/collections/testimonials', (data) => data.length),
      fetchCount('/api/admin/collections/certifications', (data) => data.length),
      fetchCount('/api/admin/collections/redirects', (data) => data.length),
      fetchCount('/api/admin/leads', (data) => data.length),
    ]).then(([projects, services, articles, caseStudies, testimonials, certifications, redirects, leads]) => {
      if (ignore) return
      setCounts({ projects, services, articles, caseStudies, testimonials, certifications, redirects, leads })
      setStatus('ready')
    })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#080d21] via-[#111735] to-[#251665] p-6 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute right-16 top-8 h-24 w-24 rounded-full bg-violet-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Content operations</p>
          <h1 className="mt-2 text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-300">An overview of your content, collections, and recent activity.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon
          const count = counts[card.key]
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-teal/40 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.iconClass}`}>
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
              <p className="mt-3 text-sm font-semibold text-slate-700 group-hover:text-brand-ink">{card.label}</p>
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
                  <li key={event.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <ActionIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-slate-600">
                      <span className="font-semibold capitalize text-slate-900">{event.action.replace('_', ' ')}</span>
                      {' '}on <span className="font-medium text-slate-800">{event.entityType}</span>
                      {event.entityId ? <span className="text-slate-400"> ({event.entityId})</span> : null}
                      {event.actorEmail ? <span className="text-slate-400"> — {event.actorEmail}</span> : null}
                    </p>
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
          <div className="mt-3 space-y-1">
            <Link to="/admin/pages/home" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-ink">Edit Home page</Link>
            <Link to="/admin/content/site-settings" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-ink">Site Settings</Link>
            <Link to="/admin/media" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-ink">Media Library</Link>
            <Link to="/admin/audit-log" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-ink">Full Audit Log</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
