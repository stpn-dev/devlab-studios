import { useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import GlassCard from '../components/GlassCard'
import PrimaryButton from '../components/PrimaryButton'

const tabs = [
  {
    key: 'hydration',
    label: 'Hydration',
    headline: 'Hydration Essentials',
    copy: 'Clean, portable, and high-repeat-purchase products for active lifestyles.',
    items: [
      { name: 'Hydra Bottle Pro', price: 39, rating: '4.9', tone: 'Best Seller' },
      { name: 'Travel Filter Kit', price: 24, rating: '4.8', tone: 'Top Rated' },
      { name: 'Insulated Mini Flask', price: 22, rating: '4.7', tone: 'Compact Pick' },
    ],
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    headline: 'Wellness Nutrition',
    copy: 'Bundles made for morning rituals, office routines, and travel convenience.',
    items: [
      { name: 'Daily Wellness Pack', price: 59, rating: '4.8', tone: 'Bundle' },
      { name: 'Energy Greens Mix', price: 34, rating: '4.7', tone: 'New' },
      { name: 'Night Reset Tea', price: 26, rating: '4.9', tone: 'Top Pick' },
    ],
  },
  {
    key: 'recovery',
    label: 'Recovery',
    headline: 'Recovery Collection',
    copy: 'Products focused on post-workout comfort and daily body maintenance.',
    items: [
      { name: 'Deep Relief Roll-On', price: 18, rating: '4.8', tone: 'Fast Moving' },
      { name: 'Muscle Ease Set', price: 48, rating: '4.9', tone: 'Bundle' },
      { name: 'Cooling Recovery Wrap', price: 31, rating: '4.7', tone: 'Editor Pick' },
    ],
  },
]

export default function LandingSampleEcommerce() {
  const [activeTab, setActiveTab] = useState('hydration')

  const selectedTab = useMemo(() => tabs.find((tab) => tab.key === activeTab) ?? tabs[0], [activeTab])
  const subtotal = selectedTab.items.reduce((sum, item) => sum + item.price, 0)

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="min-h-screen bg-[#f3efe7] text-[#1f2a36]">
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-3xl border border-[#d9cdbf] bg-[#fffdf8] p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-12">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8b7052]">E-commerce Landing Example</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
                Catalog-First Shopping Flow
                <span className="block text-[#b06c2e]">with Story + Cart Summary</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[#5f5141]">
                This arrangement is intentionally different from a standard hero-grid page. Shoppers browse by collection first,
                then convert through a persistent order summary.
              </p>
              <div className="mt-6">
                <PrimaryButton className="!bg-[#264d73] hover:!bg-[#1f4161]" variant="primary">
                  Shop New Arrivals
                </PrimaryButton>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'border-[#b06c2e] bg-[#f7e6d2] text-[#7c4b20]'
                    : 'border-[#e2d6c8] bg-white text-[#5f5141] hover:bg-[#f8f0e6]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <GlassCard className="border-[#d9cdbf] !bg-white p-6 text-left">
              <h2 className="text-3xl font-semibold text-[#243343]">{selectedTab.headline}</h2>
              <p className="mt-2 text-[#625445]">{selectedTab.copy}</p>
            </GlassCard>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {selectedTab.items.map((item, index) => (
                <article
                  key={item.name}
                  className={`rounded-2xl border p-4 ${
                    index % 2 === 0
                      ? 'border-[#dccdbd] bg-[#fff9f0]'
                      : 'border-[#cfdceb] bg-[#f6fbff]'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a6f52]">{item.tone}</p>
                  <h3 className="mt-2 text-xl font-semibold text-[#253445]">{item.name}</h3>
                  <p className="mt-1 text-sm text-[#6b5d4d]">Customer rating: {item.rating}/5</p>
                  <p className="mt-4 text-3xl font-bold text-[#b06c2e]">${item.price}</p>
                  <button className="mt-4 w-full rounded-lg border border-[#d2c0aa] bg-white px-3 py-2 text-sm font-semibold text-[#6d553b] hover:bg-[#f8ecdd]">
                    Add to Selection
                  </button>
                </article>
              ))}
            </div>

            <GlassCard className="border-[#d7cbbe] !bg-[#fffaf3] p-6 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#87694a]">Why Choose Us</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#243343]">From product education to checkout confidence</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-[#e2d5c6] bg-white p-4 text-sm text-[#5d4e3f] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-[#b06c2e] transition-colors">
                  <strong className="block text-[#1f2a36] text-base mb-1">Transparent</strong>
                  Ingredient transparency for every item card.
                </div>
                <div className="rounded-xl border border-[#e2d5c6] bg-white p-4 text-sm text-[#5d4e3f] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-[#b06c2e] transition-colors">
                  <strong className="block text-[#1f2a36] text-base mb-1">Simple</strong>
                  Quick compare blocks reduce choice fatigue.
                </div>
                <div className="rounded-xl border border-[#e2d5c6] bg-white p-4 text-sm text-[#5d4e3f] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] hover:border-[#b06c2e] transition-colors">
                  <strong className="block text-[#1f2a36] text-base mb-1">Guaranteed</strong>
                  Shipping + returns surfaced before checkout.
                </div>
              </div>
            </GlassCard>
          </div>

          <aside className="lg:col-span-4">
            <GlassCard className="sticky top-8 border-[#d8cbba] !bg-[#fffdfa] p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8f7357]">Order Summary</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#253445]">Selected Collection</h2>
              <ul className="mt-4 space-y-2">
                {selectedTab.items.map((item) => (
                  <li key={item.name} className="flex items-center justify-between border-b border-[#eadfd2] pb-2 text-sm">
                    <span className="text-[#5f5141]">{item.name}</span>
                    <span className="font-semibold text-[#2a3b4d]">${item.price}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[#665747]">Subtotal</span>
                <span className="text-2xl font-bold text-[#b06c2e]">${subtotal}</span>
              </div>
              <button className="mt-5 w-full rounded-lg bg-[#264d73] px-4 py-3 font-semibold text-white hover:bg-[#203f5d]">
                Continue to Checkout
              </button>
              <p className="mt-3 text-xs text-[#7f6b56]">Free shipping on orders over $50. 30-day returns included.</p>
            </GlassCard>
          </aside>
        </section>
      </main>
      </div>
    </>
  )
}
