import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import PrimaryButton from '../components/PrimaryButton'
import SectionHeader from '../components/SectionHeader'
import { ArrowRight, Briefcase, CheckCircle2, Clock, Code2, Download, Lightbulb, MessageSquare, Search, Settings, TrendingUp, Wrench, Zap } from '../components/icons/icons'
import resumePdf from '../assets/documents/Agustinez_Tech VA_Resume.pdf'
import dataVectorPng from '../assets/vectors/free/data.png'
import chatVectorPng from '../assets/vectors/free/chat.png'
import syncVectorPng from '../assets/vectors/free/sync.png'
import { getPersonSchema, getWebsiteSchema } from '../config/schema'

const workAreas = [
  {
    title: 'Conversion websites',
    description: 'Landing pages and business websites built to load fast, explain the offer clearly, and move visitors toward inquiry or booking.',
    icon: Code2,
  },
  {
    title: 'Automation systems',
    description: 'Lead routing, follow-up flows, AI-assisted responses, and operations automations across Zapier, n8n, Make, and HighLevel.',
    icon: Zap,
  },
  {
    title: 'Internal workflows',
    description: 'CRM integrations, dashboards, trackers, forms, and structured handoff systems that reduce manual work for teams.',
    icon: Settings,
  },
  {
    title: 'Backend and full-stack delivery',
    description: 'Java, Spring Boot, Laravel, REST APIs, SQL-backed systems, and React or Next.js interfaces that connect product logic with operations.',
    icon: ArrowRight,
  },
]

const services = [
  {
    title: 'Landing Page Builds',
    summary: 'Conversion-focused pages for local services, product launches, and offer validation.',
    deliverables: ['Messaging-led page structure', 'Responsive React or static build', 'Fast deployment to Cloudflare Pages'],
    image: dataVectorPng,
    imageAlt: 'Vector illustration for landing page structure and performance planning',
    icon: Code2,
    imageLabel: 'Page structure and launch build',
    variant: 'landing',
    tools: ['React', 'Tailwind', 'CTA Flow'],
    visualNote: 'Sections, call-to-action flow, and responsive launch setup.',
  },
  {
    title: 'AI Workflow Automation',
    summary: 'Automations that qualify leads, generate replies, route tasks, and keep communication moving.',
    deliverables: ['Zapier, n8n, or Make flows', 'AI-assisted summaries and drafting', 'Lead and client follow-up logic'],
    image: syncVectorPng,
    imageAlt: 'Vector illustration for workflow automation and system orchestration',
    icon: Zap,
    imageLabel: 'Automation and orchestration flow',
    variant: 'automation',
    tools: ['Zapier', 'n8n', 'Make.com'],
    visualNote: 'Trigger, route, qualify, and respond across connected tools.',
  },
  {
    title: 'CRM and Operations Setup',
    summary: 'Connected systems for forms, sheets, inboxes, CRMs, and internal reporting.',
    deliverables: ['CRM and spreadsheet integrations', 'Dashboards and tracking systems', 'SOP and handoff documentation'],
    image: dataVectorPng,
    imageAlt: 'Vector illustration for CRM, dashboards, and operations data flows',
    icon: Settings,
    imageLabel: 'CRM, dashboard, and ops setup',
    variant: 'crm',
    tools: ['CRM', 'Sheets', 'Dashboards'],
    visualNote: 'Operational visibility, routing, and reporting in one system flow.',
  },
  {
    title: 'Custom Business Tools',
    summary: 'Lightweight internal tools, SQL-backed workflows, and custom interfaces for teams that need more than a spreadsheet.',
    deliverables: ['Workflow-focused web interfaces', 'Backend/API integration support', 'Deployment and iteration support'],
    image: chatVectorPng,
    imageAlt: 'Vector illustration for custom internal business tools',
    icon: Wrench,
    imageLabel: 'Internal tools and custom workflows',
    variant: 'tools',
    tools: ['Internal App', 'Workflow UI', 'SQL Logic'],
    visualNote: 'Custom interfaces built around team actions and operational needs.',
  },
  {
    title: 'Backend API Support',
    summary: 'Backend implementation support for business applications that need secure data flow, integrations, and maintainable services.',
    deliverables: ['Java or Laravel service work', 'REST API integration and structured payload handling', 'Data modeling and handoff-ready documentation'],
    image: syncVectorPng,
    imageAlt: 'Vector illustration for backend integrations and API delivery',
    icon: ArrowRight,
    imageLabel: 'Backend services and API delivery',
    variant: 'backend',
    tools: ['Java', 'Laravel', 'REST API'],
    visualNote: 'Service logic, integrations, and reliable data exchange layers.',
  },
]

const processSteps = [
  {
    step: '01',
    title: 'Problem Audit',
    icon: Search,
    summary: 'We start by mapping the actual business problem, not just the requested feature. That includes bottlenecks, broken handoffs, slow response points, missing integrations, and unclear customer flow.',
    outcomes: ['Current workflow review', 'Pain point and bottleneck mapping', 'Priority opportunities for speed, clarity, and automation'],
    visualTitle: 'Audit Signals',
    visualChips: ['Bottlenecks', 'Missed Handoffs', 'Response Delay'],
    visualNote: 'The first pass is about seeing the friction clearly before solving it.',
    visualFlow: [
      { label: 'Workflow Review', icon: Search },
      { label: 'Gap Analysis', icon: Clock },
      { label: 'Priority Map', icon: TrendingUp },
    ],
  },
  {
    step: '02',
    title: 'Solution Proposal',
    icon: Lightbulb,
    summary: 'After the audit, we define the best-fit solution model. This usually includes the recommended system structure, scope, tools, delivery phases, and the expected business outcome before any build work begins.',
    outcomes: ['Recommended system direction', 'Tool and architecture fit', 'Clear scope, deliverables, and rollout plan'],
    visualTitle: 'Proposed System',
    visualChips: ['Scope', 'Tools', 'Rollout Plan'],
    visualNote: 'The proposal translates findings into a practical system direction.',
    visualFlow: [
      { label: 'Scope Fit', icon: Briefcase },
      { label: 'Tool Match', icon: Lightbulb },
      { label: 'Rollout Plan', icon: ArrowRight },
    ],
  },
  {
    step: '03',
    title: 'Solution Build-Up',
    icon: Settings,
    summary: 'Once the direction is approved, we build the website, automation, integration, or backend workflow in structured phases so each part is tested, connected, and ready for real use.',
    outcomes: ['Implementation in controlled phases', 'Integrated forms, APIs, data flow, or automation logic', 'Validation for reliability and maintainability'],
    visualTitle: 'Build Layers',
    visualChips: ['Frontend', 'Integrations', 'Validation'],
    visualNote: 'Each layer is connected, tested, and tightened before release.',
    visualFlow: [
      { label: 'Modules', icon: Code2 },
      { label: 'Integrations', icon: Settings },
      { label: 'Testing', icon: CheckCircle2 },
    ],
  },
  {
    step: '04',
    title: 'Solution Delivery',
    icon: CheckCircle2,
    summary: 'The final stage focuses on launch readiness, handoff, and operational clarity. That includes deployment, walkthroughs, documentation, and making sure the system can actually be used by the client or team.',
    outcomes: ['Launch-ready delivery', 'Documentation and handoff support', 'Operational clarity for post-launch use'],
    visualTitle: 'Launch & Handoff',
    visualChips: ['Deployment', 'Documentation', 'Team Handoff'],
    visualNote: 'Delivery means the system is live, documented, and usable by the team.',
    visualFlow: [
      { label: 'Launch', icon: Zap },
      { label: 'Walkthrough', icon: MessageSquare },
      { label: 'Handoff', icon: Briefcase },
    ],
  },
]

function ServiceGraphic({ service }) {
  const ServiceIcon = service.icon

  const renderServiceScene = () => {
    switch (service.variant) {
      case 'landing':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200/70 pb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" aria-hidden="true" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" aria-hidden="true" />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-3">
                <div className="h-3 w-24 rounded-full bg-brand-teal/20" aria-hidden="true" />
                <div className="h-4 w-4/5 rounded-full bg-slate-800/85" aria-hidden="true" />
                <div className="h-3 w-full rounded-full bg-slate-200" aria-hidden="true" />
                <div className="h-3 w-5/6 rounded-full bg-slate-200" aria-hidden="true" />
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-teal px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_18px_rgba(48,28,114,0.16)]">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Primary CTA
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-brand-mint via-white to-brand-orange/10 p-4">
                <div className="space-y-3">
                  <div className="h-24 rounded-2xl bg-white shadow-sm" aria-hidden="true" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-10 rounded-xl bg-white shadow-sm" aria-hidden="true" />
                    <div className="h-10 rounded-xl bg-white shadow-sm" aria-hidden="true" />
                    <div className="h-10 rounded-xl bg-white shadow-sm" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'automation':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-center">
              {[
                { label: 'Trigger', icon: Clock },
                { label: 'AI Logic', icon: Lightbulb },
                { label: 'Action', icon: Zap },
              ].map((item, index) => {
                const ItemIcon = item.icon

                return (
                  <div key={item.label} className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#f6f2ff] p-4 text-center shadow-sm">
                    <div
                      className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal"
                      style={{ animation: `float ${4.8 + index * 0.45}s ease-in-out infinite` }}
                    >
                      <ItemIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-brand-ink">{item.label}</p>
                    {index < 2 ? (
                      <div className="absolute -right-2 top-1/2 hidden h-[2px] w-4 -translate-y-1/2 bg-brand-teal/40 sm:block" aria-hidden="true" />
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {service.tools.map((tool, index) => (
                <span
                  key={tool}
                  className="rounded-full border border-slate-200 bg-[#faf8ff] px-3 py-1.5 text-xs font-semibold text-slate-600"
                  style={{ animation: `pulse-soft ${3.2 + index * 0.35}s ease-in-out infinite` }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )

      case 'crm':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-2xl bg-gradient-to-br from-[#f7f3ff] to-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Pipeline</div>
                <div className="mt-3 space-y-2">
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">Leads</div>
                    <div className="mt-1 text-lg font-semibold text-brand-ink">128</div>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">Tasks</div>
                    <div className="mt-1 text-lg font-semibold text-brand-ink">24</div>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-xs text-slate-500">Follow-ups</div>
                    <div className="mt-1 text-lg font-semibold text-brand-ink">9</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-white to-[#f7f3ff] p-4 ring-1 ring-slate-200">
                  <div className="flex items-end gap-2 h-24">
                    <div className="w-full rounded-t-xl bg-brand-teal/30" style={{ height: '35%' }} aria-hidden="true" />
                    <div className="w-full rounded-t-xl bg-brand-teal/45" style={{ height: '58%' }} aria-hidden="true" />
                    <div className="w-full rounded-t-xl bg-brand-teal/60" style={{ height: '78%' }} aria-hidden="true" />
                    <div className="w-full rounded-t-xl bg-brand-teal/75" style={{ height: '92%' }} aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'tools':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[0.34fr_0.66fr]">
              <div className="rounded-2xl bg-gradient-to-b from-[#f7f3ff] to-white p-4 shadow-sm">
                <div className="space-y-3">
                  <div className="h-9 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-9 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-9 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-brand-ink">Workflow Panel</p>
                      <p className="text-xs text-slate-500">Task-ready internal interface</p>
                    </div>
                    <Wrench className="h-5 w-5 text-brand-teal" aria-hidden="true" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-teal">Queue</div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-2 w-3/4 rounded-full bg-brand-teal/65" />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-teal">Status</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-brand-ink">
                      <CheckCircle2 className="h-4 w-4 text-brand-teal" aria-hidden="true" />
                      Ready
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'backend':
        return (
          <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-center">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">Client</div>
                <div className="mt-2 space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-slate-200" aria-hidden="true" />
                  <div className="h-3 w-2/3 rounded-full bg-slate-200" aria-hidden="true" />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-brand-teal">
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
                <Code2 className="h-6 w-6" aria-hidden="true" />
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#f7f3ff] to-white p-4 ring-1 ring-slate-200">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-teal">Service Layer</div>
                <div className="mt-2 space-y-2">
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                  <div className="h-8 rounded-xl bg-white ring-1 ring-slate-200" aria-hidden="true" />
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-[#f6f2ff] px-3 py-1.5">GET /api/leads</span>
                <span className="rounded-full bg-[#f6f2ff] px-3 py-1.5">POST /api/tasks</span>
                <span className="rounded-full bg-[#f6f2ff] px-3 py-1.5">200 OK</span>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] bg-white/88 p-4 shadow-[0_16px_34px_rgba(48,28,114,0.10)] sm:p-5">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-brand-mint/55 via-white to-transparent" aria-hidden="true" />
      <div className="absolute right-5 top-5 h-16 w-16 rounded-full bg-brand-orange/10 blur-2xl" aria-hidden="true" />

      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="inline-flex max-w-[90%] items-center gap-2 rounded-full border border-brand-teal/15 bg-white/95 px-3 py-2 text-[0.7rem] font-semibold text-brand-teal shadow-[0_8px_18px_rgba(48,28,114,0.08)] sm:max-w-[85%] sm:text-xs">
          <ServiceIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{service.imageLabel}</span>
        </div>
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal"
          style={{ animation: 'float 5.8s ease-in-out infinite' }}
          aria-hidden="true"
        >
          <ServiceIcon className="h-5 w-5" />
        </div>
      </div>

      <div className="relative z-10 mt-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-[#f7fbff] via-white to-[#f4efff] px-4 pb-4 pt-4">
        <div className="absolute left-4 top-4 right-4 flex flex-wrap gap-2">
          {service.tools.map((tool, index) => (
            <span
              key={tool}
              className="rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 shadow-sm sm:text-[0.72rem]"
              style={{ animation: `pulse-soft ${3.6 + index * 0.4}s ease-in-out infinite` }}
            >
              {tool}
            </span>
          ))}
        </div>

        <div className="mt-12" style={{ animation: 'fadeInScale 0.7s ease-out' }}>
          {renderServiceScene()}
        </div>

        <div className="mt-4 rounded-2xl bg-white/88 px-3 py-3 ring-1 ring-slate-200/70">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-teal">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Visual Focus
          </div>
          <p className="mt-2 text-sm text-slate-600">{service.visualNote}</p>
        </div>
      </div>
    </div>
  )
}

function ProcessGraphic({ item }) {
  const StepIcon = item.icon

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#f7fbff] via-white to-[#f3edff] p-5 shadow-[0_14px_30px_rgba(48,28,114,0.08)] ring-1 ring-slate-200/70 sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(122,0,255,0.10),transparent_34%)]" aria-hidden="true" />
      <div className="absolute left-6 top-10 right-6 h-[2px] bg-gradient-to-r from-brand-teal/20 via-brand-teal/55 to-brand-orange/25" aria-hidden="true" />

      <div className="relative z-10 grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">{item.visualTitle}</p>
            <p className="mt-1 text-sm text-slate-600">{item.visualNote}</p>
          </div>
          <div
            className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal shadow-[0_10px_22px_rgba(48,28,114,0.10)]"
            style={{ animation: 'float 5.4s ease-in-out infinite' }}
            aria-hidden="true"
          >
            <StepIcon className="h-6 w-6" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {item.visualChips.map((chip, index) => (
            <div
              key={chip}
              className="rounded-2xl bg-white/92 px-3 py-3 text-center shadow-sm ring-1 ring-slate-200/70"
              style={{ animation: `fadeInScale ${0.45 + index * 0.12}s ease-out, pulse-soft ${4.2 + index * 0.35}s ease-in-out infinite` }}
            >
              <div className="mx-auto mb-2 h-2.5 w-2.5 rounded-full bg-brand-teal/80" aria-hidden="true" />
              <p className="text-sm font-semibold text-brand-ink">{chip}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {item.visualFlow.map((flowItem, index) => {
            const FlowIcon = flowItem.icon

            return (
              <div key={flowItem.label} className="rounded-2xl border border-slate-200/70 bg-white/90 p-3">
                <div
                  className="flex items-center gap-2 text-sm font-semibold text-brand-ink"
                  style={{ animation: `fadeInScale ${0.4 + index * 0.12}s ease-out` }}
                >
                  <FlowIcon className="h-4 w-4 text-brand-teal" aria-hidden="true" />
                  {flowItem.label}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Home() {
  return (
    <>
      <Helmet>
        <title>Devlab Studios – Software Engineer &amp; AI Automation Specialist</title>
        <meta name="description" content="Devlab Studios by Stephen Rey Agustinez — software engineer and AI automation specialist building backend systems, conversion-focused websites, API integrations, and workflow automation for modern businesses worldwide." />
        <meta name="keywords" content="Stephen Agustinez, Stephen Rey Agustinez, Devlab Studios, software engineer, AI automation specialist, backend developer, workflow automation, Spring Boot, Laravel, React developer, Next.js developer, API integrations, business automation" />
        <meta property="og:title" content="Devlab Studios – Software Engineer &amp; AI Automation Specialist" />
        <meta property="og:description" content="Devlab Studios — software engineering, conversion-focused websites, backend systems, and workflow automation for modern businesses." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.devlabstudios.com/" />
        <meta property="og:image" content="/screenshots/portfolio-home.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Devlab Studios – Software Engineer &amp; AI Automation Specialist" />
        <meta name="twitter:description" content="Devlab Studios — software engineering, websites, backend integrations, and workflow automation for modern businesses." />
        <meta name="twitter:image" content="/screenshots/portfolio-home.png" />
        <script type="application/ld+json">{JSON.stringify(getPersonSchema())}</script>
        <script type="application/ld+json">{JSON.stringify(getWebsiteSchema())}</script>
      </Helmet>
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-mint/55 via-white to-indigo-50/70 p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)] sm:p-10 lg:min-h-[34rem]">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-mint/60 via-white to-indigo-50/65" aria-hidden />
        <div className="absolute left-8 top-10 h-28 w-32 bg-[radial-gradient(circle,rgba(122,0,255,0.25)_1px,transparent_1px)] bg-[length:12px_12px] opacity-25" aria-hidden />
        <div className="absolute bottom-8 right-8 h-32 w-36 bg-[radial-gradient(circle,rgba(26,22,255,0.25)_1px,transparent_1px)] bg-[length:12px_12px] opacity-20" aria-hidden />
        <div className="grid items-center gap-8 lg:min-h-[29rem] lg:grid-cols-12">
          <div className="relative z-10 space-y-6 lg:col-span-7 lg:self-center xl:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-teal/25 bg-brand-mint px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-teal">
              Software, Automation, and Web Systems
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold leading-tight text-brand-ink sm:text-5xl">
                Build the systems behind faster operations, cleaner data, and better customer flow.
              </h1>
              <p className="text-lg text-slate-600 sm:text-xl">
                We help businesses launch conversion-focused websites, backend integrations, and automation systems that answer faster, capture better data, and keep teams focused on revenue-driving work.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={resumePdf}
                download="Agustinez_Tech_VA_Resume.pdf"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition duration-200 hover:border-brand-teal/50 hover:text-brand-teal hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label="Download resume as PDF"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Download Resume
              </a>
              <PrimaryButton to="/contact" variant="primary">
                Book a Consultation
              </PrimaryButton>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="badge-pill">Available for part-time and full-time engagements</span>
              <span className="badge-pill">Based in Asia/Manila (GMT+8) • Remote-first</span>
            </div>
          </div>

          <div className="relative z-10 lg:col-span-5 lg:self-center xl:col-span-5 xl:pl-2">
            <div className="overflow-hidden rounded-2xl bg-white/88 p-2 shadow-[0_14px_32px_rgba(47,28,110,0.14)]">
              <img
                src={dataVectorPng}
                alt="Data systems workflow illustration"
                className="h-auto w-full rounded-xl object-contain"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-6">
          <SectionHeader
            title="What we work on"
            subtitle="Built from real delivery experience across websites, lead systems, and business process automation."
          />
          <div className="grid gap-4">
            {workAreas.map((item) => {
              const Icon = item.icon

              return (
                <article key={item.title} className="rounded-2xl bg-gradient-to-b from-[#fff8ff] to-[#f8f6ff] p-5 shadow-[0_14px_30px_rgba(48,28,114,0.12)]">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold text-brand-ink">{item.title}</h3>
                      <p className="text-slate-600">{item.description}</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <aside className="rounded-[1.75rem] bg-gradient-to-br from-white to-brand-mint/40 p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)] sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/90 p-4 shadow-[0_12px_24px_rgba(46,34,98,0.08)]">
              <img
                src={syncVectorPng}
                alt="Workflow sync illustration"
                className="h-auto w-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="rounded-2xl bg-white/90 p-4 shadow-[0_12px_24px_rgba(46,34,98,0.08)]">
              <img
                src={chatVectorPng}
                alt="Client communication illustration"
                className="h-auto w-full object-contain"
                loading="lazy"
              />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Typical outcomes</p>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <span className="badge-pill">Faster lead response</span>
              <span className="badge-pill">Cleaner intake and routing</span>
              <span className="badge-pill">Fewer manual follow-ups</span>
              <span className="badge-pill">More reliable delivery systems</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="space-y-6">
        <SectionHeader
          title="Services we offer"
          subtitle="The offers below are grounded in the work already shown in the portfolio, resume history, and technical stack."
        />
        <div className="space-y-5">
          {services.map((service, index) => {
            const isImageFirst = index % 2 === 1
            const ServiceIcon = service.icon

            return (
              <article
                key={service.title}
                className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#fff9ff] via-[#fbf9ff] to-[#f2efff] shadow-[0_18px_38px_rgba(48,28,114,0.12)]"
              >
                <div className="grid items-center gap-0 lg:grid-cols-2">
                  <div
                    className={[
                      'flex justify-center p-6 sm:p-8 lg:p-10',
                      isImageFirst ? 'lg:order-1' : 'lg:order-2',
                    ].join(' ')}
                  >
                    <ServiceGraphic service={service} />
                  </div>

                  <div
                    className={[
                      'space-y-5 p-6 sm:p-8 lg:p-10',
                      isImageFirst ? 'lg:order-2' : 'lg:order-1',
                    ].join(' ')}
                  >
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">
                        Service {String(index + 1).padStart(2, '0')}
                      </p>
                      <h3 className="text-2xl font-semibold text-brand-ink sm:text-3xl">{service.title}</h3>
                      <p className="max-w-2xl text-slate-600">{service.summary}</p>
                    </div>

                    <ul className="space-y-3 text-sm text-slate-700 sm:text-base">
                      {service.deliverables.map((deliverable) => (
                        <li key={deliverable} className="flex gap-3 leading-relaxed">
                          <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                          <span>{deliverable}</span>
                        </li>
                      ))}
                    </ul>

                    <div>
                      <Link to="/contact" className="text-sm font-semibold text-brand-teal transition hover:text-brand-orange">
                        Ask about this service
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="space-y-6">
        <SectionHeader
          title="Problem To Solution Approach"
          subtitle="A four-phase delivery model: diagnose the problem, define the approach, build in structured phases, and deliver with full handoff support."
        />
        <div className="rounded-[1.75rem] bg-gradient-to-br from-white via-[#fbf9ff] to-brand-mint/30 p-6 shadow-[0_18px_40px_rgba(48,28,114,0.12)] sm:p-8 lg:p-10">
          <div className="relative">
            <div className="absolute bottom-0 left-5 top-0 w-[2px] bg-gradient-to-b from-brand-teal/10 via-brand-teal/45 to-brand-orange/15 lg:left-1/2 lg:-translate-x-1/2" aria-hidden="true" />

            <div className="space-y-6 lg:space-y-8">
              {processSteps.map((item, index) => {
                const isRight = index % 2 === 1
                const StepIcon = item.icon

                return (
                  <div key={item.step} className="relative lg:grid lg:grid-cols-2 lg:items-center lg:gap-10">
                    <div
                      className={[
                        'pl-16 lg:pl-0',
                        isRight ? 'lg:order-2 lg:pl-10' : 'lg:order-1 lg:pr-10',
                      ].join(' ')}
                    >
                      <div className="rounded-[1.5rem] bg-white/92 p-5 shadow-[0_14px_30px_rgba(48,28,114,0.10)] ring-1 ring-slate-200/70 sm:p-6">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                              <StepIcon className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Step {item.step}</p>
                              <h3 className="text-2xl font-semibold text-brand-ink">{item.title}</h3>
                            </div>
                          </div>

                          <p className="text-slate-600">{item.summary}</p>

                          <ul className="space-y-3 text-sm text-slate-700 sm:text-base">
                            {item.outcomes.map((outcome) => (
                              <li key={outcome} className="flex gap-3 leading-relaxed">
                                <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                                <span>{outcome}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div
                      className={[
                        'mt-4 pl-16 lg:mt-0 lg:pl-0',
                        isRight ? 'lg:order-1 lg:pr-10' : 'lg:order-2 lg:pl-10',
                      ].join(' ')}
                    >
                      <ProcessGraphic item={item} />
                    </div>

                    <div className="absolute left-5 top-8 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-brand-teal text-sm font-semibold text-white shadow-[0_10px_22px_rgba(48,28,114,0.18)] lg:left-1/2 lg:top-10" aria-hidden="true">
                      {item.step}
                    </div>

                    <div
                      className={[
                        'absolute top-[3.25rem] hidden h-[2px] bg-brand-teal/30 lg:block',
                        isRight ? 'left-1/2 w-10' : 'right-1/2 w-10',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-gradient-to-r from-brand-ink via-[#22185a] to-[#3120a3] p-6 text-white shadow-[0_22px_50px_rgba(20,13,64,0.22)] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Why clients hire DevLab Studios</p>
            <h2 className="text-3xl font-semibold leading-tight">A practical mix of front-end delivery, automation logic, and operations thinking.</h2>
            <p className="text-white/75">
              The work spans landing pages, business websites, AI-assisted workflows, CRM integrations, backend services, dashboards, and internal tools, so projects can move from offer presentation to operational execution without handing off to multiple freelancers.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-semibold">Web + backend + automation</p>
              <p className="mt-1 text-sm text-white/70">One workflow from first click to service delivery and handoff.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-semibold">Systems-oriented</p>
              <p className="mt-1 text-sm text-white/70">Built around structured data flow, reliability, and maintainable delivery.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
    </>
  )
}

export default Home
