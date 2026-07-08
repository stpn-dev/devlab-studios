import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import SectionHeader from '../components/SectionHeader'
import PrimaryButton from '../components/PrimaryButton'
import { ArrowRight, Briefcase, CheckCircle2, Code2, Lightbulb, MessageSquare, Settings, Shield, Wrench, Zap } from '../components/icons/icons'
import { useProjects } from '../hooks/useProjects'

const solutionGroups = [
  {
    eyebrow: 'Customer Response',
    title: 'Customer Response & AI Agents',
    description: 'AI-assisted messaging, customer follow-up, and response systems that keep leads and clients moving without waiting on manual replies.',
    icon: MessageSquare,
    capabilities: [
      'Facebook Messenger AI agents',
      'Escalation and quote follow-up emails',
      'AI-assisted support and response workflows',
      'Context-aware reply generation and routing',
    ],
    projectIds: ['p6-messenger-ai-agent', 'p2-escalation-email', 'p2-quote-follow-up'],
  },
  {
    eyebrow: 'Intake',
    title: 'Lead Intake & Scheduling Automation',
    description: 'Systems that capture inquiries, qualify leads, prepare context, and route next steps before work gets stuck in inboxes or calendars.',
    icon: Zap,
    capabilities: [
      'Webhook-based lead enrichment',
      'Booked-calendar intake workflows',
      'AI call transcript qualification',
      'Priority routing and stakeholder alerts',
      'CRM, sheet, and task handoff logic',
    ],
    projectIds: ['p10-automated-lead-qualification', 'p3-leads-enrichment', 'p9-guest-researcher-calendar-client'],
  },
  {
    eyebrow: 'Operations',
    title: 'Operations & Data Workflows',
    description: 'Backend-friendly automation for files, finance records, location data, task systems, and reporting handoffs across business tools.',
    icon: Settings,
    capabilities: [
      'Buyer ranking and contact enrichment',
      'Xero transaction export and task handoff',
      'Gmail attachment sorting and metadata logging',
      'Geocoding and structured review pipelines',
      'Google Sheets, Drive, Asana, and API integrations',
    ],
    projectIds: ['p11-wholesaling-buyer-intelligence', 'p4-xero-to-asana', 'p5-gmail-attachments-drive', 'p8-arv-enterprise-geocoding'],
  },
  {
    eyebrow: 'Growth',
    title: 'Content & Growth Automation',
    description: 'Automations that help teams generate, route, check, and publish content without rebuilding the same campaign steps manually.',
    icon: Lightbulb,
    capabilities: [
      'Content repurposing from uploaded assets',
      'AI social content generation',
      'Duplicate checks and publishing safeguards',
      'Facebook, LinkedIn, Drive, and Sheets flows',
    ],
    projectIds: ['p1-content-repurposing', 'p7-ai-social-content'],
  },
  {
    eyebrow: 'Web Systems',
    title: 'Web & Business Interfaces',
    description: 'Conversion pages, business websites, ecommerce concepts, local-service pages, and full-stack UI samples built around clear offers and workflows.',
    icon: Code2,
    capabilities: [
      'React and Tailwind landing pages',
      'Local service lead-generation pages',
      'E-commerce product landing flows',
      'Full-stack dashboard and contact interface samples',
    ],
    projectIds: ['w1-react-modern', 'w5-local-service', 'w6-ecommerce', 'w4-laravel-fullstack'],
  },
]

const processSteps = [
  {
    title: 'Map the workflow',
    description: 'Review the current process, tools, handoffs, and friction before recommending a solution.',
    icon: Lightbulb,
  },
  {
    title: 'Build the system',
    description: 'Implement the website, automation, integration, or internal workflow in practical delivery phases.',
    icon: Wrench,
  },
  {
    title: 'Validate and hand off',
    description: 'Test reliability, document the flow, and make the system understandable for real operations.',
    icon: CheckCircle2,
  },
]

const faqs = [
  {
    question: 'Are these fixed products or custom solutions?',
    answer: 'Most DevLab Studios solutions are custom builds using proven patterns. The starting point is the business problem, then the implementation is scoped around the tools, data, and workflow already in use.',
  },
  {
    question: 'Can you work with Zapier, Make, and n8n?',
    answer: 'Yes. Solutions can be built with Zapier, Make, n8n, or direct API integrations depending on complexity, maintainability, and what the workflow requires.',
  },
  {
    question: 'Do you only build AI automations?',
    answer: 'No. AI is used where it creates leverage, such as drafting, summarizing, classifying, or responding. Many solutions also include websites, backend services, dashboards, CRM logic, or internal tools.',
  },
  {
    question: 'How do I know which solution fits?',
    answer: 'Start with the workflow that wastes the most time or loses the most opportunities. A discovery conversation can identify whether the best first move is a website, an automation, an AI agent, or a backend integration.',
  },
]

function getProjects(projectIds, projectItems) {
  return projectIds
    .map((id) => projectItems.find((item) => item.id === id))
    .filter(Boolean)
}

function Services() {
  const projectItems = useProjects()

  return (
    <>
      <Helmet>
        <title>Services - Business Automation & Web Solutions | DevLab Studios</title>
        <meta name="description" content="Explore DevLab Studios services and solutions across AI agents, lead intake, operations workflows, content automation, websites, and backend integrations." />
        <meta name="keywords" content="AI automation services, workflow automation, business automation solutions, AI agents, lead intake automation, web development services, backend integrations" />
        <link rel="canonical" href="https://www.devlabstudios.com/services" />
        <meta property="og:title" content="Services - Business Automation & Web Solutions | DevLab Studios" />
        <meta property="og:description" content="Solutions for customer response, lead intake, operations workflows, content automation, and web business interfaces." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.devlabstudios.com/services" />
        <meta property="og:image" content="https://www.devlabstudios.com/devlabstudios-logo-only.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Services - DevLab Studios" />
        <meta name="twitter:description" content="Business automation and web solution categories built around real workflows." />
        <meta name="twitter:image" content="https://www.devlabstudios.com/devlabstudios-logo-only.png" />
      </Helmet>

      <div className="space-y-10">
        <section className="rounded-[28px] bg-gradient-to-br from-brand-mint/55 via-white to-[#f3efff] p-6 shadow-[0_20px_44px_rgba(46,34,98,0.12)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Services as solutions</p>
              <h1 className="text-4xl font-semibold leading-tight text-brand-ink sm:text-5xl">
                Business automation, AI agents, and web systems built around real operations.
              </h1>
              <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
                DevLab Studios groups services by business problem: missed responses, messy intake, manual operations, repeated content work, and websites that need clearer conversion paths.
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton to="/contact">
                  <MessageSquare size={16} />
                  Book a Consultation
                </PrimaryButton>
                <PrimaryButton to="/profile" variant="secondary">
                  <Briefcase size={16} />
                  View Project Proof
                </PrimaryButton>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {processSteps.map((step, index) => {
                const Icon = step.icon

                return (
                  <article key={step.title} className="rounded-2xl bg-white/92 p-5 shadow-[0_12px_28px_rgba(48,28,114,0.10)] ring-1 ring-slate-200/70">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Step {String(index + 1).padStart(2, '0')}</p>
                        <h3 className="mt-1 font-semibold text-brand-ink">{step.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.description}</p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader
            title="Solution Categories"
            subtitle="Each category connects to actual project patterns already built across website, automation, API, and AI workflow work."
          />

          <div className="space-y-6">
            {solutionGroups.map((group, index) => {
              const Icon = group.icon
              const projects = getProjects(group.projectIds, projectItems)
              const isReversed = index % 2 === 1

              return (
                <article key={group.title} className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#fff9ff]/95 via-[#f8f6ff]/92 to-[#f2f0ff]/90 shadow-[0_18px_45px_rgba(60,28,120,0.14)]">
                  <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
                    <div className={['space-y-5 p-6 sm:p-8', isReversed ? 'lg:order-2' : 'lg:order-1'].join(' ')}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">{group.eyebrow}</p>
                          <h2 className="text-2xl font-semibold text-brand-ink">{group.title}</h2>
                        </div>
                      </div>
                      <p className="text-slate-700">{group.description}</p>
                      <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                        {group.capabilities.map((capability) => (
                          <li key={capability} className="flex gap-3 leading-relaxed">
                            <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                            <span>{capability}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className={['bg-white/55 p-6 sm:p-8', isReversed ? 'lg:order-1' : 'lg:order-2'].join(' ')}>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-teal">Related project patterns</p>
                      <div className="mt-4 grid gap-3">
                        {projects.map((project) => (
                          <div key={project.id} className="rounded-2xl bg-white/95 p-4 shadow-sm ring-1 ring-slate-200">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-semibold text-brand-ink">{project.title}</h3>
                                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{project.description}</p>
                              </div>
                              <span className="rounded-full bg-brand-mint px-3 py-1 text-xs font-semibold text-brand-teal">{project.type}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {project.techStack.slice(0, 4).map((tech) => (
                                <span key={tech} className="rounded-full border border-slate-200 bg-[#faf8ff] px-2.5 py-1 text-[0.7rem] font-semibold text-slate-600">
                                  {tech}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-[28px] bg-gradient-to-r from-brand-ink via-[#22185a] to-[#3120a3] p-6 text-white shadow-[0_22px_50px_rgba(20,13,64,0.22)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Not sure where to start?</p>
              <h2 className="mt-2 text-3xl font-semibold">Start with the workflow that loses the most time or opportunities.</h2>
              <p className="mt-3 text-white/75">
                A short discovery conversation can identify whether your best first move is a website, automation, AI agent, internal tool, or backend integration.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <PrimaryButton to="/contact">
                <MessageSquare size={16} />
                Start a Project Conversation
              </PrimaryButton>
              <PrimaryButton to="/resources" variant="secondary">
                <Shield size={16} />
                Read Resources
              </PrimaryButton>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeader title="FAQ" subtitle="Common questions about DevLab Studios solution work." />
          <div className="grid gap-4 lg:grid-cols-2">
            {faqs.map((faq) => (
              <article key={faq.question} className="rounded-2xl bg-white/92 p-5 shadow-[0_12px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200">
                <h3 className="font-semibold text-brand-ink">{faq.question}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-center text-lg font-semibold text-brand-ink">Quick Links</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Link to="/about" className="block rounded-2xl bg-white/90 p-5 text-center shadow-[0_10px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200 transition hover:ring-brand-orange/35">
              <p className="text-sm font-semibold text-brand-ink">About</p>
              <p className="mt-1 text-sm text-slate-600">DevLab Studios mission and approach</p>
            </Link>
            <Link to="/profile" className="block rounded-2xl bg-white/90 p-5 text-center shadow-[0_10px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200 transition hover:ring-brand-orange/35">
              <p className="text-sm font-semibold text-brand-ink">Profile</p>
              <p className="mt-1 text-sm text-slate-600">Founder background and project proof</p>
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
