import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import SectionHeader from '../components/SectionHeader'
import PrimaryButton from '../components/PrimaryButton'
import ServiceGraphic from '../components/ServiceGraphic'
import { ArrowRight, Briefcase, CheckCircle2, Clock, Code2, Lightbulb, MessageSquare, Settings, Wrench, Zap } from '../components/icons/icons'
import dataVectorPng from '../assets/vectors/free/data.png'
import chatVectorPng from '../assets/vectors/free/chat.png'
import syncVectorPng from '../assets/vectors/free/sync.png'

const services = [
  {
    id: 'landing-page-builds',
    title: 'Landing Page Builds',
    summary: 'Conversion-focused pages for local services, product launches, and offer validation.',
    details:
      'Built for businesses that need a clear offer, strong call-to-action flow, and a responsive page that can move visitors toward inquiry, booking, or purchase.',
    icon: Code2,
    image: dataVectorPng,
    imageAlt: 'Animated vector for landing page structure and conversion planning',
    imageLabel: 'Page structure and launch build',
    variant: 'landing',
    visualNote: 'Sections, call-to-action flow, and responsive launch setup.',
    deliverables: ['Messaging-led page structure', 'Responsive React or static build', 'Fast deployment to Cloudflare Pages'],
    tools: ['React', 'Tailwind', 'CTA Flow'],
  },
  {
    id: 'ai-workflow-automation',
    title: 'AI Workflow Automation',
    summary: 'Automations that qualify leads, generate replies, route tasks, and keep communication moving.',
    details:
      'Best for teams that are losing time to manual follow-up, repetitive messaging, or disconnected apps across sales, support, and operations.',
    icon: Zap,
    image: syncVectorPng,
    imageAlt: 'Animated vector for connected AI workflow automation',
    imageLabel: 'Automation and orchestration flow',
    variant: 'automation',
    visualNote: 'Trigger, route, qualify, and respond across connected tools.',
    deliverables: ['Zapier, n8n, or Make flows', 'AI-assisted summaries and drafting', 'Lead and client follow-up logic'],
    tools: ['Zapier', 'n8n', 'Make.com'],
  },
  {
    id: 'crm-and-operations-setup',
    title: 'CRM and Operations Setup',
    summary: 'Connected systems for forms, sheets, inboxes, CRMs, and internal reporting.',
    details:
      'A fit for businesses that need better routing, cleaner intake, stronger reporting, and less manual status checking across the team.',
    icon: Settings,
    image: dataVectorPng,
    imageAlt: 'Animated vector for CRM dashboards and operations data',
    imageLabel: 'CRM, dashboard, and ops setup',
    variant: 'crm',
    visualNote: 'Operational visibility, routing, and reporting in one system flow.',
    deliverables: ['CRM and spreadsheet integrations', 'Dashboards and tracking systems', 'SOP and handoff documentation'],
    tools: ['CRM', 'Sheets', 'Dashboards'],
  },
  {
    id: 'custom-business-tools',
    title: 'Custom Business Tools',
    summary: 'Lightweight internal tools, SQL-backed workflows, and custom interfaces for teams that need more than a spreadsheet.',
    details:
      'Useful when off-the-shelf tools are too rigid and the team needs a focused internal interface for specific operational steps.',
    icon: Wrench,
    image: chatVectorPng,
    imageAlt: 'Animated vector for custom business tools and internal workflows',
    imageLabel: 'Internal tools and custom workflows',
    variant: 'tools',
    visualNote: 'Custom interfaces built around team actions and operational needs.',
    deliverables: ['Workflow-focused web interfaces', 'Backend/API integration support', 'Deployment and iteration support'],
    tools: ['Internal App', 'Workflow UI', 'SQL Logic'],
  },
  {
    id: 'backend-api-support',
    title: 'Backend API Support',
    summary: 'Backend implementation support for business applications that need secure data flow, integrations, and maintainable services.',
    details:
      'Designed for businesses or teams that need clean service logic, API integrations, structured payload handling, and reliable backend delivery.',
    icon: ArrowRight,
    image: syncVectorPng,
    imageAlt: 'Animated vector for backend API integrations and service delivery',
    imageLabel: 'Backend services and API delivery',
    variant: 'backend',
    visualNote: 'Service logic, integrations, and reliable data exchange layers.',
    deliverables: ['Java or Laravel service work', 'REST API integration and structured payload handling', 'Data modeling and handoff-ready documentation'],
    tools: ['Java', 'Laravel', 'REST API'],
  },
]

const process = [
  {
    title: 'Problem Audit',
    description: 'We begin by reviewing the current workflow, system gaps, and delivery friction so the actual business problem is clear before solutioning.',
    icon: Clock,
  },
  {
    title: 'Solution Proposal',
    description: 'We define the recommended direction, scope, tools, and rollout structure before implementation starts.',
    icon: Lightbulb,
  },
  {
    title: 'Build and Delivery',
    description: 'We implement in structured phases, validate reliability, and hand off with enough clarity for real operational use.',
    icon: CheckCircle2,
  },
]

function Services() {
  return (
    <>
      <Helmet>
        <title>Services – Software Engineering, Automation, and Web Systems | Devlab Studios</title>
        <meta name="description" content="Explore Devlab Studios services across landing pages, AI workflow automation, CRM setup, custom internal tools, and backend API support." />
      </Helmet>
      <div className="space-y-10">
        <SectionHeader
          title="Services"
          subtitle="Software engineering, automation, and web delivery services built around real business workflows and operational needs."
        />

        <section className="rounded-[28px] bg-gradient-to-br from-brand-mint/40 via-white to-[#f3efff] p-8 shadow-[0_18px_45px_rgba(60,28,120,0.14)] sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">What we help build</p>
              <h2 className="text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">Services designed to move from business problem to working system.</h2>
              <p className="max-w-2xl text-base text-slate-700 sm:text-lg">
                The same offers introduced on the landing page are detailed here so clients can quickly understand where each service fits and what kind of delivery to expect.
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton to="/contact">
                  <MessageSquare size={16} />
                  Start a Project Conversation
                </PrimaryButton>
                <PrimaryButton to="/portfolio" variant="secondary">
                  <Briefcase size={16} />
                  View Portfolio
                </PrimaryButton>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {process.map((item, index) => {
                const Icon = item.icon

                return (
                  <article key={item.title} className="rounded-2xl bg-white/92 p-5 shadow-[0_12px_28px_rgba(48,28,114,0.10)] ring-1 ring-slate-200/70">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Step {String(index + 1).padStart(2, '0')}</p>
                    <h3 className="mt-2 text-lg font-semibold text-brand-ink">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {services.map((service, index) => {
            const Icon = service.icon
            const isVisualFirst = index % 2 === 1

            return (
              <article key={service.id} className="overflow-hidden rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 shadow-[0_18px_45px_rgba(60,28,120,0.14)]">
                <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                  <div className={['flex justify-center p-6 sm:p-7 lg:p-8', isVisualFirst ? 'lg:order-2' : 'lg:order-1'].join(' ')}>
                    <ServiceGraphic service={service} />
                  </div>

                  <div className={['space-y-4 p-6 sm:p-7 lg:p-8', isVisualFirst ? 'lg:order-1' : 'lg:order-2'].join(' ')}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Service</p>
                      <h3 className="text-xl font-semibold text-brand-ink">{service.title}</h3>
                    </div>
                  </div>

                  <p className="text-slate-700">{service.summary}</p>
                  <p className="text-sm leading-relaxed text-slate-600">{service.details}</p>

                  <div className="flex flex-wrap gap-2">
                    {service.tools.map((tool) => (
                      <span key={tool} className="rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-600">
                        {tool}
                      </span>
                    ))}
                  </div>

                  <ul className="space-y-2 text-sm text-slate-700">
                    {service.deliverables.map((deliverable) => (
                      <li key={deliverable} className="flex gap-3 leading-relaxed">
                        <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                        <span>{deliverable}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-2">
                    <Link to="/contact" className="text-sm font-semibold text-brand-teal transition hover:text-brand-orange">
                      Ask about this service
                    </Link>
                  </div>
                </div>
                </div>
              </article>
            )
          })}
        </section>

        <section className="space-y-4">
          <h3 className="text-center text-lg font-semibold text-brand-ink">Quick Links</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link to="/about" className="block rounded-2xl bg-white/90 p-5 text-center shadow-[0_10px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200 transition hover:ring-brand-orange/35">
              <p className="text-sm font-semibold text-brand-ink">About</p>
              <p className="mt-1 text-sm text-slate-600">How I work and what I value</p>
            </Link>
            <Link to="/portfolio" className="block rounded-2xl bg-white/90 p-5 text-center shadow-[0_10px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200 transition hover:ring-brand-orange/35">
              <p className="text-sm font-semibold text-brand-ink">Portfolio</p>
              <p className="mt-1 text-sm text-slate-600">Recent work samples</p>
            </Link>
            <Link to="/contact" className="block rounded-2xl bg-white/90 p-5 text-center shadow-[0_10px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200 transition hover:ring-brand-orange/35">
              <p className="text-sm font-semibold text-brand-ink">Contact</p>
              <p className="mt-1 text-sm text-slate-600">Discuss your project or workflow need</p>
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}

export default Services
