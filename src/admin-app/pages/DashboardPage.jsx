import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../lib/adminApi'

const QUICK_LINKS = [
  { label: 'Projects', to: '/admin/content/projects' },
  { label: 'Services', to: '/admin/content/services' },
  { label: 'Articles', to: '/admin/content/resources' },
  { label: 'Testimonials', to: '/admin/collections/testimonials' },
  { label: 'Certifications', to: '/admin/collections/certifications' },
  { label: 'Redirects', to: '/admin/collections/redirects' },
]

function DashboardPage() {
  const [recentEvents, setRecentEvents] = useState([])

  useEffect(() => {
    adminApi.get('/api/admin/audit-log?limit=5').then(setRecentEvents).catch(() => {})
  }, [])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-brand-teal/40">
            {link.label}
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent Activity</h2>
        {recentEvents.length ? (
          <ul className="space-y-2">
            {recentEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{event.action}</span> on {event.entityType}
                {event.entityId ? ` (${event.entityId})` : ''} — {new Date(event.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No activity yet.</p>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
