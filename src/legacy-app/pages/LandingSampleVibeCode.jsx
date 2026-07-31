import GlassCard from '../../components/GlassCard'

const cards = [
  { title: 'Visual Builder', desc: 'Create sections with drag-and-drop blocks in minutes.', color: 'from-fuchsia-500 to-pink-500' },
  { title: 'Template Packs', desc: 'Start from polished page templates and customize instantly.', color: 'from-cyan-500 to-blue-500' },
  { title: 'Quick Publish', desc: 'Deploy directly with built-in hosting and forms.', color: 'from-amber-400 to-orange-500' },
]

export default function LandingSampleVibeCode() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-600 via-pink-500 to-indigo-500 text-white">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <section className="text-center">
          <p className="inline-flex rounded-full border border-white/30 bg-white/15 px-4 py-1 text-sm">No-Code / Vibe Style</p>
          <h1 className="mt-6 text-5xl font-black sm:text-6xl">Build Bold Websites Fast</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/90">
            A playful, colorful landing page style inspired by visual builders. Great for startups, campaigns, and creators who want fast results.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button className="rounded-full bg-white px-7 py-3 font-bold text-fuchsia-700 shadow-xl hover:scale-105">Start Building</button>
            <button className="rounded-full border border-white/40 bg-white/10 px-7 py-3 font-bold hover:bg-white/20">Preview Templates</button>
          </div>
        </section>

        <section className="mt-14 grid gap-5 md:grid-cols-3">
          {cards.map((card) => (
            <GlassCard key={card.title} className="p-6">
              <div className={`mb-4 h-2 rounded-full bg-gradient-to-r ${card.color}`} />
              <h3 className="text-2xl font-bold">{card.title}</h3>
              <p className="mt-2 text-white/90">{card.desc}</p>
            </GlassCard>
          ))}
        </section>

        <section className="mt-14 grid gap-6 md:grid-cols-2">
          <GlassCard className="p-8 bg-white/20">
            <h2 className="text-3xl font-black">Why clients love this look</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-white/90">
              <li>High visual energy for promotions</li>
              <li>Clear call-to-action hierarchy</li>
              <li>Quickly assembled and easy to edit</li>
            </ul>
          </GlassCard>
          <GlassCard className="p-8 bg-white/20">
            <h2 className="text-3xl font-black">Perfect use-cases</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-white/90">
              <li>Launch campaigns</li>
              <li>Creator or influencer pages</li>
              <li>Event promotions</li>
            </ul>
          </GlassCard>
        </section>
      </main>
    </div>
  )
}
