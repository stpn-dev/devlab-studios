import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import GlassCard from '../../components/GlassCard'

const metrics = [
  { label: 'Active Users', value: '1,247', tone: 'text-cyan-300' },
  { label: 'Monthly Revenue', value: '$48.2K', tone: 'text-emerald-300' },
  { label: 'API Uptime', value: '99.98%', tone: 'text-violet-300' },
  { label: 'Avg Response', value: '42ms', tone: 'text-amber-300' },
]

export default function LandingSampleFullStack() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <section className="text-center">
          <p className="inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-1 text-sm text-cyan-200">
            Laravel + PHP + MariaDB Full Stack
          </p>
          <h1 className="mt-6 text-5xl font-bold sm:text-6xl">Operations Dashboard Website</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-200/80">
            A backend-driven website concept with dashboard widgets, reporting, role-based actions, and integrated contact workflow.
          </p>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <GlassCard key={m.label} className="p-5">
              <p className="text-sm text-slate-300">{m.label}</p>
              <p className={`mt-2 text-3xl font-bold ${m.tone}`}>{m.value}</p>
            </GlassCard>
          ))}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <GlassCard className="p-6 lg:col-span-2">
            <h2 className="text-2xl font-semibold">Recent Activity</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-200/85">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <span>Invoice generated for Client #2043</span>
                <span className="text-cyan-300">2 mins ago</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <span>Lead captured via landing form</span>
                <span className="text-emerald-300">6 mins ago</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <span>Backup completed (MariaDB)</span>
                <span className="text-violet-300">14 mins ago</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-2xl font-semibold">Stack Details</h2>
            <ul className="mt-4 space-y-2 text-slate-200/85">
              <li>Laravel API + Blade views</li>
              <li>MariaDB relational schema</li>
              <li>Role-based authentication</li>
              <li>Queued jobs + email events</li>
            </ul>
          </GlassCard>
        </section>

        <section className="mt-10">
          <GlassCard className="p-8">
            <h2 className="text-2xl font-semibold">Contact / Lead Form (Mock)</h2>
            <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
              <input
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-slate-100 placeholder:text-slate-400"
                placeholder="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <input
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-slate-100 placeholder:text-slate-400"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <textarea
                className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-slate-100 placeholder:text-slate-400 sm:col-span-2"
                rows={4}
                placeholder="Project goals"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              />
              <button className="rounded-lg bg-cyan-600 px-5 py-3 font-semibold text-white hover:bg-cyan-500 sm:col-span-2">
                Submit Inquiry
              </button>
            </form>
          </GlassCard>
        </section>
      </main>
      </div>
    </>
  )
}
