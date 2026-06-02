import { Helmet } from 'react-helmet-async'
import SectionHeader from '../components/SectionHeader'
import PrimaryButton from '../components/PrimaryButton'
import { ArrowRight, CheckCircle2, Code2, Lightbulb, MessageSquare, Search, Settings, Shield, Zap } from '../components/icons/icons'

const guides = [
  {
    title: 'Where AI automation fits in small business workflows',
    summary: 'A practical guide to finding repetitive, high-friction tasks where automation can improve speed, consistency, and handoff quality.',
    category: 'Strategy',
    icon: Lightbulb,
    points: ['Missed follow-ups', 'Manual routing', 'Repeated summaries', 'Disconnected tools'],
  },
  {
    title: 'When to use Zapier, Make, or n8n',
    summary: 'How to choose an automation platform based on workflow complexity, maintainability, integrations, and technical control.',
    category: 'Tools',
    icon: Settings,
    points: ['Simple app triggers', 'Router-heavy flows', 'Self-hosted control', 'API-heavy builds'],
  },
  {
    title: 'Lead intake automation checklist',
    summary: 'A checklist for capturing, qualifying, enriching, routing, and following up with inbound leads before opportunities get cold.',
    category: 'Lead Systems',
    icon: Search,
    points: ['Capture source', 'Qualification logic', 'Priority routing', 'CRM or sheet logging'],
  },
  {
    title: 'AI agents vs workflow automations',
    summary: 'A clear distinction between deterministic automations and AI agents that reason through context, messages, and multi-step tasks.',
    category: 'AI Agents',
    icon: Zap,
    points: ['Fixed workflow', 'Context-aware response', 'Human review', 'Tool execution'],
  },
  {
    title: 'Preparing business data for automation',
    summary: 'What to clean, structure, and document before connecting spreadsheets, CRMs, inboxes, APIs, and task systems.',
    category: 'Data Readiness',
    icon: Shield,
    points: ['Stable fields', 'Clean ownership', 'Error handling', 'Audit visibility'],
  },
]

const playbooks = [
  'Map one workflow from trigger to final handoff.',
  'Identify where work waits on a person, inbox, or spreadsheet.',
  'Define what should be automated, drafted, routed, or only reported.',
  'Keep humans in the loop where risk, judgment, or client trust matters.',
]

function Resources() {
  return (
    <>
      <Helmet>
        <title>Resources - AI Automation Guides | DevLab Studios</title>
        <meta name="description" content="AI automation resources from DevLab Studios covering workflow automation, Zapier, Make, n8n, AI agents, lead intake systems, and automation readiness." />
        <meta name="keywords" content="AI automation resources, workflow automation guide, Zapier Make n8n comparison, AI agents guide, lead intake automation checklist" />
        <link rel="canonical" href="https://www.devlabstudios.com/resources" />
        <meta property="og:title" content="Resources - AI Automation Guides | DevLab Studios" />
        <meta property="og:description" content="Practical guides for understanding AI automation, workflow tools, lead intake, AI agents, and business data readiness." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.devlabstudios.com/resources" />
        <meta property="og:image" content="https://www.devlabstudios.com/devlabstudios-logo-only.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Resources - AI Automation Guides" />
        <meta name="twitter:description" content="Static AI automation guide hub from DevLab Studios." />
        <meta name="twitter:image" content="https://www.devlabstudios.com/devlabstudios-logo-only.png" />
      </Helmet>

      <div className="space-y-10">
        <section className="rounded-[28px] bg-gradient-to-br from-brand-mint/55 via-white to-[#f3efff] p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Resources</p>
              <h1 className="text-4xl font-semibold leading-tight text-brand-ink sm:text-5xl">
                Practical AI automation guides for business workflows.
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
                A static resource hub for understanding where AI automation fits, how workflow tools compare, and what to prepare before building connected systems.
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton to="/services">
                  <Code2 size={16} />
                  Explore Solutions
                </PrimaryButton>
                <PrimaryButton to="/contact" variant="secondary">
                  <MessageSquare size={16} />
                  Ask About a Workflow
                </PrimaryButton>
              </div>
            </div>

            <div className="rounded-[24px] bg-white/90 p-6 shadow-[0_16px_34px_rgba(48,28,114,0.10)] ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Automation Readiness</p>
              <h2 className="mt-2 text-2xl font-semibold text-brand-ink">Start with workflow clarity.</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {playbooks.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader
            title="AI Automation Guides"
            subtitle="Evergreen notes for business owners and teams planning automation, AI agents, and tool integrations."
          />

          <div className="grid gap-5 lg:grid-cols-2">
            {guides.map((guide) => {
              const Icon = guide.icon

              return (
                <article key={guide.title} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">{guide.category}</p>
                      <h2 className="mt-1 text-xl font-semibold text-brand-ink">{guide.title}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{guide.summary}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {guide.points.map((point) => (
                      <span key={point} className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-600">
                        {point}
                      </span>
                    ))}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-[28px] bg-gradient-to-r from-brand-ink via-[#22185a] to-[#3120a3] p-6 text-white shadow-[0_22px_50px_rgba(20,13,64,0.22)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Need implementation?</p>
              <h2 className="mt-2 text-3xl font-semibold">Turn the guide into a working workflow.</h2>
              <p className="mt-3 text-white/75">
                DevLab Studios can help map your current process, pick the right automation stack, and build the system around your team’s tools.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <PrimaryButton to="/contact">
                <MessageSquare size={16} />
                Start a Conversation
              </PrimaryButton>
              <PrimaryButton to="/services" variant="secondary">
                <ArrowRight size={16} />
                View Services
              </PrimaryButton>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

export default Resources
