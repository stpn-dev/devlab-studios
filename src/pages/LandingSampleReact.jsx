import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import GlassCard from '../components/GlassCard'
import PrimaryButton from '../components/PrimaryButton'
import { Check } from '../components/icons/icons'

const spotlightBlocks = [
  {
    label: 'Hero + Offer',
    title: 'Message-first opening section',
    description: 'Clear promise, one primary CTA, and one secondary action for better decision flow.',
  },
  {
    label: 'Social Proof',
    title: 'Trust presented before details',
    description: 'Review snippets, metrics, and logos appear high on the page to reduce friction.',
  },
  {
    label: 'Service Breakdown',
    title: 'Three paths for three buyer types',
    description: 'Visitors self-select a package instantly, which shortens the sales conversation.',
  },
]

const processSteps = [
  {
    step: '01',
    title: 'Discovery Sprint',
    detail: 'We map audience, offer clarity, and conversion goals in a focused kickoff workshop.',
  },
  {
    step: '02',
    title: 'Design Direction',
    detail: 'You receive two art directions so the final site has a distinct visual personality.',
  },
  {
    step: '03',
    title: 'Build + QA',
    detail: 'Sections are built in React + Tailwind, then checked for performance and responsiveness.',
  },
  {
    step: '04',
    title: 'Launch + Optimize',
    detail: 'Post-launch analytics and iterative updates keep the page converting over time.',
  },
]

const packages = [
  {
    key: 'single',
    name: 'Single Page Offer',
    price: '$950',
    summary: 'Best for coaching offers or local lead-gen campaigns.',
    points: ['Custom hero + CTA flow', 'Mobile-first build', 'Contact/booking integration'],
  },
  {
    key: 'brand',
    name: 'Brand Site Pro',
    price: '$2,100',
    summary: 'Ideal for service businesses needing credibility and lead capture.',
    points: ['5-page information architecture', 'Trust and testimonial system', 'SEO-ready content blocks'],
  },
  {
    key: 'growth',
    name: 'Growth Funnel Site',
    price: '$3,400',
    summary: 'For teams that need landing pages, lead magnets, and experimentation.',
    points: ['Multi-step funnel journey', 'Analytics + event tracking', 'A/B test-ready sections'],
  },
]

export default function LandingSampleReact() {
  const [selectedPackage, setSelectedPackage] = useState('brand')
  const activePackage = packages.find((pack) => pack.key === selectedPackage) ?? packages[1]

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="min-h-screen bg-[#f7f1e8] text-[#1c2535]">
      <section className="relative overflow-hidden border-b border-[#d8c9b3]">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#d88f4c]/30 blur-3xl" />
        <div className="absolute top-16 -right-28 h-80 w-80 rounded-full bg-[#5d7ea7]/25 blur-3xl" />

        <div className="relative grid max-w-6xl gap-8 px-4 py-16 mx-auto md:grid-cols-12 md:py-20 sm:px-6">
          <div className="md:col-span-7">
            <p className="inline-flex items-center rounded-full border border-[#cbb79f] bg-white/65 px-4 py-1 text-sm font-medium text-[#5e4b36]">
              React + Tailwind Editorial Build
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-6xl">
              A Different Look,
              <span className="block text-[#b45e2f]">A Different Buyer Journey</span>
            </h1>
            <p className="max-w-2xl mt-5 text-lg text-[#38445b]">
              This sample uses an editorial conversion layout instead of a standard SaaS stack.
              The arrangement is designed to guide attention from promise to proof to action.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <PrimaryButton className="!bg-[#1f395d] hover:!bg-[#19304f]" variant="primary" showIcon>
                Request This Layout
              </PrimaryButton>
              <PrimaryButton className="!border-[#7f9bbd] !text-[#1f395d] hover:!bg-[#e8eef7]" variant="secondary">
                Preview Mobile Flow
              </PrimaryButton>
            </div>
          </div>

          <div className="md:col-span-5">
            <GlassCard className="h-full border-[#d7c7ae] !bg-white/70 p-5 text-left backdrop-blur-md">
              <p className="text-xs font-semibold tracking-[0.14em] text-[#7d6347]">LIVE STRUCTURE</p>
              <div className="mt-4 space-y-3">
                {spotlightBlocks.map((block, index) => (
                  <div
                    key={block.title}
                    className="rounded-xl border border-[#e4d7c4] bg-white/80 p-3"
                    style={{ animation: 'fadeInScale 500ms ease', animationDelay: `${index * 120}ms` }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#916741]">{block.label}</p>
                    <p className="mt-1 font-semibold text-[#24324a]">{block.title}</p>
                    <p className="mt-1 text-sm text-[#4b5b75]">{block.description}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      <section className="max-w-6xl px-4 mx-auto py-14 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-3xl font-semibold text-[#1e2b43]">Build Process</h2>
            <p className="mt-2 text-[#45536b]">A cleaner arrangement from kickoff to launch in four clear stages.</p>

            <div className="space-y-4 mt-7">
              {processSteps.map((item) => (
                <div key={item.step} className="flex gap-4 rounded-2xl border border-[#ddceb9] bg-white/75 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#203b5f] text-sm font-bold text-white">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#1f2f48]">{item.title}</h3>
                    <p className="mt-1 text-[#4a5a72]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <GlassCard className="border-[#d9cab6] !bg-[#fffaf3] p-6 text-left">
              <p className="text-xs font-semibold tracking-[0.13em] text-[#886642]">PACKAGE SELECTOR</p>
              <div className="grid gap-2 mt-4">
                {packages.map((pack) => (
                  <button
                    key={pack.key}
                    onClick={() => setSelectedPackage(pack.key)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      selectedPackage === pack.key
                        ? 'border-[#1f395d] bg-[#edf3fb]'
                        : 'border-[#ddceb9] bg-white hover:bg-[#f8f2e9]'
                    }`}
                  >
                    <p className="font-semibold text-[#24324a]">{pack.name}</p>
                    <p className="text-sm text-[#5a6b84]">{pack.summary}</p>
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-[#d6c4aa] bg-white p-4">
                <p className="text-sm font-semibold text-[#7c5f44]">Current package</p>
                <h3 className="mt-1 text-2xl font-semibold text-[#1f2f48]">{activePackage.name}</h3>
                <p className="mt-1 text-3xl font-bold text-[#b45e2f]">{activePackage.price}</p>
                <ul className="mt-4 space-y-2 text-[#3e4d65]">
                  {activePackage.points.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-[#2b5c3a]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      <section className="max-w-6xl px-4 pb-16 mx-auto sm:px-6">
        <div className="rounded-3xl border border-[#ccb59a] bg-gradient-to-r from-[#203b5f] to-[#2b547a] p-8 text-white sm:p-10">
          <p className="text-sm tracking-[0.12em] text-[#d8e6f9]">FINAL CTA</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Want this exact visual style for your niche?</h2>
          <p className="max-w-2xl mt-3 text-[#deebff]">
            This concept is intentionally different from the other samples, so you can show clients multiple design directions instead of one repeated template.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <PrimaryButton className="!bg-white !text-[#1f395d] hover:!bg-[#eff5fd]" variant="primary">
              Start Build Request
            </PrimaryButton>
            <PrimaryButton className="!border-white/70 hover:!bg-white/10" variant="secondary">
              Compare With Other Samples
            </PrimaryButton>
          </div>
        </div>
      </section>
      </div>
    </>
  )
}
