import { Link } from 'react-router-dom'
import PageSeo from '../../components/PageSeo'
import SectionHeader from '../../components/SectionHeader'
import PrimaryButton from '../../components/PrimaryButton'
import { ArrowRight, BadgeCheck, Briefcase, CheckCircle2, Code2, Lightbulb, MessageSquare, Settings, Shield, Zap } from '../../components/icons/icons'

const buildAreas = [
  {
    title: 'Conversion-focused websites',
    description: 'Landing pages and business websites that explain an offer clearly, load quickly, and move visitors toward inquiry, booking, or purchase.',
    icon: Code2,
  },
  {
    title: 'Business automation systems',
    description: 'Workflows that connect CRMs, forms, inboxes, calendars, spreadsheets, and task systems so operations move with less manual effort.',
    icon: Zap,
  },
  {
    title: 'Backend and integration support',
    description: 'API-connected services, structured payload handling, SQL-backed workflows, and handoff-ready technical implementation.',
    icon: Settings,
  },
]

const principles = [
  'Start with the real workflow before choosing tools.',
  'Build small enough to ship, but structured enough to maintain.',
  'Keep data flow, handoff, and reliability visible.',
  'Use automation where it removes repeat work or response delays.',
]

const faqs = [
  {
    question: 'When was DevLab Studios founded?',
    answer: 'DevLab Studios was founded on March 2, 2026 as a focused software engineering and AI automation studio for practical business systems.',
  },
  {
    question: 'What kind of businesses does DevLab Studios help?',
    answer: 'The studio helps service businesses, operators, founders, and small teams that need better websites, cleaner intake, faster follow-up, or connected internal workflows.',
  },
  {
    question: 'Is DevLab Studios only an automation provider?',
    answer: 'No. Automation is one part of the work. DevLab Studios also builds websites, backend integrations, internal tools, and workflow-focused interfaces.',
  },
  {
    question: 'How does a project usually start?',
    answer: 'Projects start with a practical workflow review. The goal is to understand the business problem, map the current process, and then define the smallest reliable system that can solve it.',
  },
]

function About() {
  return (
    <>
      <PageSeo pageSlug="about" />

      <div className="space-y-10">
        <SectionHeader
          title="About DevLab Studios"
          subtitle="A software engineering and AI automation studio focused on real business workflows, reliable systems, and practical delivery."
        />

        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-ink via-[#241963] to-[#3320a3] p-6 text-white shadow-[0_24px_54px_rgba(20,13,64,0.24)] sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Founded March 2, 2026</p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Systems for clearer offers, faster operations, and cleaner handoffs.
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
                DevLab Studios helps businesses turn messy manual workflows into usable web systems, automation flows, backend integrations, and customer-facing experiences.
              </p>
              <div className="flex flex-wrap gap-3">
                <PrimaryButton to="/services">
                  <Briefcase size={16} />
                  View Services
                </PrimaryButton>
                <PrimaryButton to="/profile" variant="secondary">
                  <BadgeCheck size={16} />
                  Founder Profile
                </PrimaryButton>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Focus', value: 'Web + automation + backend' },
                { label: 'Approach', value: 'Workflow-first delivery' },
                { label: 'Founder', value: 'Stephen Rey Agustinez' },
                { label: 'Availability', value: 'Remote-first worldwide' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Our Mission</p>
            <h2 className="text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl">
              Make business systems easier to launch, connect, and operate.
            </h2>
            <p className="text-slate-700">
              DevLab Studios exists to help businesses reduce operational friction with practical software. The mission is to build systems that clarify the customer journey, connect the tools behind the work, and make repeated processes easier to manage.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {principles.map((principle) => (
              <div key={principle} className="rounded-2xl bg-white/90 p-5 shadow-[0_12px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200">
                <CheckCircle2 className="h-5 w-5 text-brand-teal" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold leading-relaxed text-brand-ink">{principle}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeader
            title="What DevLab Studios Builds"
            subtitle="The work sits between front-end delivery, backend implementation, and automation logic."
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {buildAreas.map((area) => {
              const Icon = area.icon

              return (
                <article key={area.title} className="rounded-[28px] bg-gradient-to-b from-[#fff9ff]/95 via-[#f8f6ff]/90 to-[#f2f0ff]/88 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.14)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-mint text-brand-teal">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-brand-ink">{area.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{area.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-[28px] bg-white/90 p-6 shadow-[0_18px_45px_rgba(60,28,120,0.10)] ring-1 ring-slate-200 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Founder Note</p>
              <h2 className="mt-2 text-3xl font-semibold text-brand-ink">Built from hands-on software and operations experience.</h2>
            </div>
            <p className="text-slate-700">
              DevLab Studios is led by Stephen Rey Agustinez, a software engineer and AI automation specialist with experience across Java, Spring Boot, Laravel, React, REST APIs, SQL, Zapier, Make, n8n, and operational process improvement. The studio is designed for clients who need implementation that understands both code and the workflow around it.
            </p>
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeader title="FAQ" subtitle="Common questions about how DevLab Studios works." />
          <div className="grid gap-4 lg:grid-cols-2">
            {faqs.map((faq) => (
              <article key={faq.question} className="rounded-2xl bg-white/92 p-5 shadow-[0_12px_28px_rgba(60,28,120,0.08)] ring-1 ring-slate-200">
                <div className="flex items-start gap-3">
                  <Lightbulb className="mt-1 h-5 w-5 flex-shrink-0 text-brand-teal" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-brand-ink">{faq.question}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-gradient-to-r from-brand-mint/50 via-white to-[#f3efff] p-6 shadow-[0_18px_45px_rgba(60,28,120,0.10)] sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-teal">Next Step</p>
              <h2 className="mt-2 text-2xl font-semibold text-brand-ink">Need a system designed around your workflow?</h2>
            </div>
            <Link to="/contact" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-teal transition hover:text-brand-orange">
              Start a project conversation
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}

export default About
