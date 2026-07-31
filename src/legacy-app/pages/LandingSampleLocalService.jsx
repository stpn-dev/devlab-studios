import { Helmet } from 'react-helmet-async'
import GlassCard from '../../components/GlassCard'
import PrimaryButton from '../../components/PrimaryButton'

const jobFlow = [
  {
    phase: 'Dispatch',
    detail: 'Calls are triaged in under 5 minutes and assigned to the nearest available technician.',
  },
  {
    phase: 'On-Site Fix',
    detail: 'Fully equipped van arrives with parts, diagnostics tools, and digital service checklist.',
  },
  {
    phase: 'Follow-Up',
    detail: 'Customers receive service summary, warranty, and preventive maintenance recommendation.',
  },
]

const serviceZones = ['Downtown Core', 'North District', 'Riverside', 'East View', 'West Hills', 'Business Park']

const trustPills = ['Licensed and Insured', 'Arrival Window Guarantee', 'Transparent Flat-Rate Pricing']

export default function LandingSampleLocalService() {
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="min-h-screen bg-[#eef4f9] text-[#0f243b]">
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="rounded-3xl border border-[#bcd0e2] bg-gradient-to-br from-[#174a78] via-[#1f5d93] to-[#113657] p-8 text-white sm:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d4e8fb]">Local Service Website Example</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
                Phone-First Layout for
                <span className="block text-[#8fd4ff]">Emergency Plumbing Leads</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[#d7e9fa]">
                This arrangement prioritizes urgent actions first: tap-to-call, available zones, and guaranteed arrival messaging.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <PrimaryButton className="!bg-white !text-[#154973] hover:!bg-[#eef6ff]" variant="primary">
                  Call Now: (555) 010-221
                </PrimaryButton>
                <PrimaryButton className="!border-[#c0daf0] hover:!bg-white/15" variant="secondary">
                  Request Same-Day Visit
                </PrimaryButton>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 text-sm">
                {trustPills.map((pill) => (
                  <span key={pill} className="rounded-full border border-white/30 bg-white/10 px-3 py-1">
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <GlassCard className="border-[#c4d8e7] !bg-white/80 p-5 text-center">
                <p className="text-3xl font-bold text-[#1c5f95]">4.9/5</p>
                <p className="mt-1 text-[#4a5f78]">Average Rating</p>
              </GlassCard>
              <GlassCard className="border-[#c4d8e7] !bg-white/80 p-5 text-center">
                <p className="text-3xl font-bold text-[#1c5f95]">2,300+</p>
                <p className="mt-1 text-[#4a5f78]">Jobs Completed</p>
              </GlassCard>
              <GlassCard className="border-[#c4d8e7] !bg-white/80 p-5 text-center">
                <p className="text-3xl font-bold text-[#1c5f95]">24/7</p>
                <p className="mt-1 text-[#4a5f78]">Hotline Support</p>
              </GlassCard>
            </div>
          </div>

          <aside className="lg:col-span-4 flex flex-col">
            <GlassCard className="flex-1 border-[#c4d8e7] !bg-white p-6 text-left flex flex-col justify-center shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5c7896]">Quick Intake Form</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#173b5f]">Book a Technician</h2>
              <form className="mt-4 grid gap-3" onSubmit={(event) => event.preventDefault()}>
                <input
                  className="rounded-lg border border-[#d2deea] bg-[#f9fcff] px-4 py-3 placeholder:text-[#7891a8]"
                  placeholder="Full Name"
                />
                <input
                  className="rounded-lg border border-[#d2deea] bg-[#f9fcff] px-4 py-3 placeholder:text-[#7891a8]"
                  placeholder="Phone Number"
                />
                <select className="rounded-lg border border-[#d2deea] bg-[#f9fcff] px-4 py-3 text-[#173b5f]">
                  <option>Drain Issue</option>
                  <option>Leak Repair</option>
                  <option>Water Heater</option>
                  <option>Inspection</option>
                </select>
                <button className="rounded-lg bg-[#1f5d93] px-4 py-3 font-semibold text-white hover:bg-[#184d79]">
                  Confirm Schedule
                </button>
              </form>
            </GlassCard>
          </aside>
        </section>

        <section className="mt-10 rounded-3xl border border-[#c9d8e5] bg-white p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#57728e]">How Work Gets Done</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#173b5f]">Service Journey Timeline</h2>
              <p className="mt-3 text-[#4d6178]">
                Instead of generic cards, this section maps what customers experience from first call to post-service care.
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="space-y-4">
                {jobFlow.map((item, index) => (
                  <div key={item.phase} className="flex gap-4 rounded-2xl border border-[#d6e1eb] bg-[#f9fcff] p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1f5d93] text-sm font-bold text-white">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[#1a3f63]">{item.phase}</h3>
                      <p className="mt-1 text-[#4d6178]">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 rounded-3xl border border-[#c3d4e3] bg-[#143a5d] p-6 text-white sm:p-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-8">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b8daf6]">Coverage Areas</p>
            <h2 className="mt-2 text-3xl font-semibold">Service Zones Updated Live</h2>
            <p className="mt-3 max-w-2xl text-[#d0e6fb]">
              Area-first arrangement helps customers quickly confirm if your team operates in their neighborhood.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {serviceZones.map((zone) => (
                <span key={zone} className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-sm">
                  {zone}
                </span>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 lg:text-right">
            <PrimaryButton className="!w-full !bg-white !text-[#173b5f] hover:!bg-[#ecf5ff] lg:!w-auto" variant="primary">
              Check Next Available Slot
            </PrimaryButton>
          </div>
        </section>
      </main>
      </div>
    </>
  )
}
